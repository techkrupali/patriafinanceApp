#!/usr/bin/env bash
#
# Patriai server deploy: the Laravel API (patriai-api/) and, if asked, the
# Next.js admin panel (admin/). Run it on the server from the git checkout:
#
#   ./deploy/deploy.sh              deploy the latest main
#   ./deploy/deploy.sh --rollback   go back to the code before the last deploy
#   ./deploy/deploy.sh --check      only check the server (cron, worker, health)
#   ./deploy/deploy.sh --help
#
# What a deploy does, in order:
#   1. checks the tools and patriai-api/.env, and that nobody edited files here
#   2. takes the latest code from GitHub (fast-forward only)
#   3. backs up the database (pg_dump / mysqldump / sqlite copy)
#   4. puts the API in maintenance mode (the app shows "back soon")
#   5. composer install, migrations, storage link, caches
#   6. restarts the queue workers and brings the API back up
#   7. checks /up, pending migrations, the scheduler cron and the queue worker
#   8. (DEPLOY_ADMIN=1) builds and restarts the admin panel
#
# Settings: copy deploy/deploy.env.example to deploy/deploy.env on the server
# and edit it, or pass them as environment variables (BRANCH=main ./deploy/...).
#
# First time on a new server (once):
#   git clone <repo> /var/www/patriafinanceApp && cd /var/www/patriafinanceApp
#   cp patriai-api/.env.example patriai-api/.env   # then fill in DB, mail, banking, APP_URL
#   (cd patriai-api && composer install --no-dev && php artisan key:generate)
#   Scheduler (crontab -e for the web user):
#     * * * * * cd /var/www/patriafinanceApp/patriai-api && php artisan schedule:run >> /dev/null 2>&1
#   Queue worker (supervisor, /etc/supervisor/conf.d/patriai-worker.conf):
#     [program:patriai-worker]
#     command=php /var/www/patriafinanceApp/patriai-api/artisan queue:work --sleep=3 --tries=3 --max-time=3600
#     user=www-data
#     autostart=true
#     autorestart=true
#     stopwaitsecs=3600
#     stdout_logfile=/var/www/patriafinanceApp/patriai-api/storage/logs/worker.log
#   Then: ./deploy/deploy.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Server-specific settings, never committed.
if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/deploy.env"
fi

APP_ROOT="${APP_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
API_DIR="$APP_ROOT/patriai-api"
ADMIN_DIR="$APP_ROOT/admin"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
PHP="${PHP:-php}"
COMPOSER="${COMPOSER:-composer}"
WEB_USER="${WEB_USER:-www-data}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/../patriai-backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
MAINTENANCE="${MAINTENANCE:-1}"
PHP_FPM_SERVICE="${PHP_FPM_SERVICE:-}"
HEALTH_URL="${HEALTH_URL:-}"
FORCE="${FORCE:-0}"
DEPLOY_ADMIN="${DEPLOY_ADMIN:-0}"
ADMIN_PM2_NAME="${ADMIN_PM2_NAME:-patriai-admin}"
ADMIN_PORT="${ADMIN_PORT:-3111}"
API_ORIGIN="${API_ORIGIN:-}"

HISTORY="$BACKUP_DIR/deploy-history.log"
STAMP="$(date +%Y%m%d-%H%M%S)"
IN_MAINTENANCE=0
BACKUP_FILE=""

# ---------------------------------------------------------------- helpers

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
ok() { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

artisan() { (cd "$API_DIR" && "$PHP" artisan "$@"); }

# A value from patriai-api/.env, without quotes. Empty if the key is missing.
env_get() {
  local line value
  line="$(grep -E "^${1}=" "$API_DIR/.env" 2>/dev/null | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}
env_has() { grep -qE "^${1}=" "$API_DIR/.env" 2>/dev/null; }

on_error() {
  local code=$? line=${1:-?}
  printf '\n\033[1;31mDeploy failed (line %s, exit %s).\033[0m\n' "$line" "$code" >&2
  if [[ "$IN_MAINTENANCE" == 1 ]]; then
    printf 'The API is still in maintenance mode, so nobody uses half-updated code.\n' >&2
    printf '  Bring it back as it is:   cd %s && %s artisan up\n' "$API_DIR" "$PHP" >&2
    printf '  Or go back to the old code: %s/deploy.sh --rollback\n' "$SCRIPT_DIR" >&2
  fi
  if [[ -n "$BACKUP_FILE" ]]; then
    printf 'Database backup taken before this deploy: %s\n' "$BACKUP_FILE" >&2
  fi
  exit "$code"
}
trap 'on_error $LINENO' ERR

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  cat <<EOF

Settings now:
  APP_ROOT=$APP_ROOT
  BRANCH=$BRANCH  REMOTE=$REMOTE  PHP=$PHP  WEB_USER=$WEB_USER
  BACKUP_DIR=$BACKUP_DIR  KEEP_BACKUPS=$KEEP_BACKUPS  MAINTENANCE=$MAINTENANCE
  DEPLOY_ADMIN=$DEPLOY_ADMIN  ADMIN_PM2_NAME=$ADMIN_PM2_NAME  ADMIN_PORT=$ADMIN_PORT
EOF
}

# ----------------------------------------------------------------- checks

preflight() {
  step "Checking the server"
  local tool
  for tool in git "$PHP" "$COMPOSER" curl; do
    command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed or not on PATH."
  done
  [[ -d "$APP_ROOT/.git" ]] || die "$APP_ROOT is not a git checkout. Set APP_ROOT in deploy/deploy.env."
  [[ -f "$API_DIR/.env" ]] || die "$API_DIR/.env is missing. Copy .env.example and fill it in first."

  local phpv
  phpv="$("$PHP" -r 'echo PHP_VERSION;')"
  "$PHP" -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' || die "PHP $phpv is too old; Patriai needs 8.2 or newer."
  ok "PHP $phpv"

  local ext mods missing=()
  mods="$("$PHP" -m)"
  for ext in mbstring openssl curl bcmath pdo json tokenizer xml fileinfo; do
    grep -qix "$ext" <<<"$mods" || missing+=("$ext")
  done
  case "$(env_get DB_CONNECTION)" in
    pgsql) grep -qix 'pdo_pgsql' <<<"$mods" || missing+=(pdo_pgsql) ;;
    mysql | mariadb) grep -qix 'pdo_mysql' <<<"$mods" || missing+=(pdo_mysql) ;;
    sqlite | '') grep -qix 'pdo_sqlite' <<<"$mods" || missing+=(pdo_sqlite) ;;
  esac
  [[ ${#missing[@]} -eq 0 ]] || die "PHP extensions missing: ${missing[*]}"
  ok "PHP extensions"

  [[ -n "$(env_get APP_KEY)" ]] || die "APP_KEY is empty in .env. Run: cd $API_DIR && $PHP artisan key:generate"
  [[ "$(env_get APP_ENV)" == "production" ]] || warn "APP_ENV is '$(env_get APP_ENV)', not production."
  [[ "$(env_get APP_DEBUG)" != "true" ]] || warn "APP_DEBUG=true: error details and test codes can show in the app. Set APP_DEBUG=false on a live server."

  if [[ $EUID -eq 0 ]]; then
    warn "Running as root. It works, but a deploy user (or $WEB_USER) is safer."
    export COMPOSER_ALLOW_SUPERUSER=1
  fi
  mkdir -p "$BACKUP_DIR"
}

# Only one deploy at a time.
lock() {
  exec 9>"$BACKUP_DIR/.deploy.lock"
  if command -v flock >/dev/null 2>&1; then
    flock -n 9 || die "Another deploy is running."
  fi
}

# ------------------------------------------------------------------- code

update_code() {
  step "Taking the latest $BRANCH from $REMOTE"
  cd "$APP_ROOT"
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    git status --short --untracked-files=no
    [[ "$FORCE" == 1 ]] || die "Files were edited on the server (above). Commit them in the repo instead, or run with FORCE=1 to throw these edits away."
    warn "FORCE=1: throwing away the edits above."
    git reset --hard HEAD
  fi
  PREV_COMMIT="$(git rev-parse HEAD)"
  git fetch --prune "$REMOTE" "$BRANCH"
  git checkout "$BRANCH" >/dev/null 2>&1 || git checkout -b "$BRANCH" "$REMOTE/$BRANCH"
  git merge --ff-only "$REMOTE/$BRANCH" || die "Can't fast-forward $BRANCH. Someone committed on the server; sort it out by hand."
  NEW_COMMIT="$(git rev-parse HEAD)"
  if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
    ok "Already on the latest commit $(git log -1 --format='%h %s')"
  else
    ok "$(git rev-parse --short "$PREV_COMMIT") → $(git rev-parse --short "$NEW_COMMIT")"
    git --no-pager log --oneline "$PREV_COMMIT..$NEW_COMMIT" | sed 's/^/      /'
  fi
}

# --------------------------------------------------------------- database

backup_db() {
  step "Backing up the database"
  local conn host port name user pass
  conn="$(env_get DB_CONNECTION)"; conn="${conn:-sqlite}"
  host="$(env_get DB_HOST)"; host="${host:-127.0.0.1}"
  port="$(env_get DB_PORT)"
  name="$(env_get DB_DATABASE)"
  user="$(env_get DB_USERNAME)"
  pass="$(env_get DB_PASSWORD)"
  local short
  short="$(cd "$APP_ROOT" && git rev-parse --short HEAD)"

  case "$conn" in
    pgsql)
      command -v pg_dump >/dev/null 2>&1 || die "pg_dump is not installed (apt install postgresql-client)."
      BACKUP_FILE="$BACKUP_DIR/patriai-$STAMP-$short.dump"
      PGPASSWORD="$pass" pg_dump -h "$host" -p "${port:-5432}" -U "$user" -Fc -f "$BACKUP_FILE" "$name"
      ;;
    mysql | mariadb)
      command -v mysqldump >/dev/null 2>&1 || die "mysqldump is not installed."
      BACKUP_FILE="$BACKUP_DIR/patriai-$STAMP-$short.sql.gz"
      MYSQL_PWD="$pass" mysqldump -h "$host" -P "${port:-3306}" -u "$user" --single-transaction --routines "$name" | gzip >"$BACKUP_FILE"
      ;;
    sqlite)
      local file="${name:-$API_DIR/database/database.sqlite}"
      [[ "$file" = /* ]] || file="$API_DIR/$file"
      BACKUP_FILE="$BACKUP_DIR/patriai-$STAMP-$short.sqlite"
      cp "$file" "$BACKUP_FILE"
      ;;
    *) die "Don't know how to back up DB_CONNECTION=$conn." ;;
  esac
  [[ -s "$BACKUP_FILE" ]] || die "The backup came out empty: $BACKUP_FILE"
  ok "$BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

  # Keep the newest $KEEP_BACKUPS backups.
  local old
  old="$(ls -1t "$BACKUP_DIR"/patriai-*.{dump,sql.gz,sqlite} 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" || true)"
  if [[ -n "$old" ]]; then
    printf '%s\n' "$old" | xargs rm -f
    ok "Removed $(printf '%s\n' "$old" | wc -l | tr -d ' ') old backup(s)"
  fi
}

# -------------------------------------------------------------------- API

maintenance_on() {
  [[ "$MAINTENANCE" == 1 ]] || return 0
  step "Maintenance mode on"
  artisan down --retry=60 --refresh=15 >/dev/null
  IN_MAINTENANCE=1
  ok "The app shows a short 'back soon' while this runs"
}

maintenance_off() {
  [[ "$IN_MAINTENANCE" == 1 ]] || return 0
  artisan up >/dev/null
  IN_MAINTENANCE=0
  ok "Maintenance mode off"
}

build_api() {
  step "Installing PHP packages"
  (cd "$API_DIR" && "$COMPOSER" install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-progress)

  step "Running migrations"
  artisan migrate --force

  step "Storage, permissions and caches"
  [[ -e "$API_DIR/public/storage" ]] || artisan storage:link
  mkdir -p "$API_DIR/storage/logs" "$API_DIR/bootstrap/cache"
  artisan optimize:clear >/dev/null
  artisan config:cache >/dev/null
  artisan route:cache >/dev/null
  artisan event:cache >/dev/null
  ok "Config, routes and events cached"
  # After artisan ran (maybe as root): the web server must still write logs and uploads.
  if [[ $EUID -eq 0 ]] && id "$WEB_USER" >/dev/null 2>&1; then
    chown -R "$WEB_USER":"$WEB_USER" "$API_DIR/storage" "$API_DIR/bootstrap/cache"
  fi
  chmod -R ug+rwX "$API_DIR/storage" "$API_DIR/bootstrap/cache" 2>/dev/null || true
  ok "storage/ and bootstrap/cache belong to $WEB_USER"

  step "Restarting workers"
  artisan queue:restart >/dev/null
  ok "Queue workers will pick up the new code"
  if [[ -n "$PHP_FPM_SERVICE" ]]; then
    if command -v systemctl >/dev/null 2>&1; then
      systemctl reload "$PHP_FPM_SERVICE" && ok "Reloaded $PHP_FPM_SERVICE"
    else
      warn "PHP_FPM_SERVICE is set but systemctl isn't here; reload PHP-FPM yourself."
    fi
  fi
}

# ------------------------------------------------------------------ admin

deploy_admin() {
  [[ "$DEPLOY_ADMIN" == 1 ]] || return 0
  step "Admin panel"
  command -v npm >/dev/null 2>&1 || die "npm is not installed; can't build the admin panel."
  [[ -n "$API_ORIGIN" ]] || die "Set API_ORIGIN (e.g. https://ecofuelglobal.com) so the admin panel reaches the API."
  (cd "$ADMIN_DIR" && npm ci --no-audit --no-fund && API_ORIGIN="$API_ORIGIN" npm run build)
  if command -v pm2 >/dev/null 2>&1; then
    if pm2 describe "$ADMIN_PM2_NAME" >/dev/null 2>&1; then
      (cd "$ADMIN_DIR" && API_ORIGIN="$API_ORIGIN" pm2 restart "$ADMIN_PM2_NAME" --update-env >/dev/null)
    else
      (cd "$ADMIN_DIR" && API_ORIGIN="$API_ORIGIN" pm2 start npm --name "$ADMIN_PM2_NAME" -- start -- -p "$ADMIN_PORT" >/dev/null && pm2 save >/dev/null)
    fi
    ok "Admin running under pm2 as $ADMIN_PM2_NAME on port $ADMIN_PORT"
  else
    warn "pm2 isn't installed. Start the admin yourself: cd $ADMIN_DIR && API_ORIGIN=$API_ORIGIN npm start -- -p $ADMIN_PORT"
  fi
}

# ----------------------------------------------------------------- checks

post_checks() {
  step "Checking it works"
  local pending
  pending="$(artisan migrate:status 2>/dev/null | grep -c 'Pending' || true)"
  [[ "$pending" == 0 ]] && ok "No pending migrations" || warn "$pending migration(s) still pending."

  local base url code
  base="${HEALTH_URL:-$(env_get APP_URL)}"
  base="${base%/}"
  if [[ -n "$base" && "$base" != http://localhost* ]]; then
    for url in "$base/up" "$base/api/v1/app/status"; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url" || true)"
      [[ "$code" == 200 ]] && ok "$url → 200" || warn "$url → $code"
    done
  else
    warn "APP_URL isn't the public address; set HEALTH_URL to check the API from outside."
  fi

  # Rounds, giving dates, ajo turns and reminders all run from the scheduler.
  local cron=""
  cron="$(crontab -l 2>/dev/null || true)"
  if [[ $EUID -eq 0 ]] && id "$WEB_USER" >/dev/null 2>&1; then
    cron+=$'\n'"$(crontab -u "$WEB_USER" -l 2>/dev/null || true)"
  fi
  cron+=$'\n'"$(cat /etc/cron.d/* 2>/dev/null || true)"
  if grep -q 'schedule:run' <<<"$cron"; then
    ok "Scheduler cron found"
  else
    warn "No scheduler cron. Giving dates, ajo rounds, savings and reminders won't run. Add for $WEB_USER:"
    warn "* * * * * cd $API_DIR && $PHP artisan schedule:run >> /dev/null 2>&1"
  fi

  # Notifications and emails go through the database queue.
  if pgrep -f 'artisan queue:work' >/dev/null 2>&1; then
    ok "Queue worker running"
  else
    warn "No queue worker running. Notifications and emails will wait. See the supervisor example at the top of this script."
  fi

  # The built-in test login (config/services.php otp_test).
  if env_has OTP_TEST_CODE && [[ -z "$(env_get OTP_TEST_CODE)" ]]; then
    ok "Test login is off (OTP_TEST_CODE is empty)"
  else
    local phones code6
    phones="$(env_get OTP_TEST_PHONES)"; phones="${phones:-+2348000000011}"
    code6="$(env_get OTP_TEST_CODE)"; code6="${code6:-583920}"
    warn "Test login is ON: $phones with code $code6. Before real users, add OTP_TEST_CODE= (empty) to .env and deploy again."
  fi
}

record() {
  printf '%s %s %s %s\n' "$STAMP" "${PREV_COMMIT:-?}" "$(cd "$APP_ROOT" && git rev-parse HEAD)" "${BACKUP_FILE:--}" >>"$HISTORY"
}

# --------------------------------------------------------------- commands

deploy() {
  bold "Patriai deploy · $(hostname) · $(date '+%d %b %Y %H:%M')"
  preflight
  lock
  update_code
  backup_db
  maintenance_on
  build_api
  maintenance_off
  deploy_admin
  post_checks
  record
  bold $'\n'"Done: $(cd "$APP_ROOT" && git log -1 --format='%h %s')"
}

rollback() {
  bold "Patriai rollback · $(hostname)"
  preflight
  lock
  [[ -s "$HISTORY" ]] || die "No deploy history in $HISTORY, so there's nothing to go back to."
  local last prev backup
  last="$(tail -n 1 "$HISTORY")"
  prev="$(awk '{print $2}' <<<"$last")"
  backup="$(awk '{print $4}' <<<"$last")"
  [[ "$prev" =~ ^[0-9a-f]{40}$ ]] || die "The last history line has no previous commit: $last"
  step "Going back to $(cd "$APP_ROOT" && git log -1 --format='%h %s' "$prev")"
  cd "$APP_ROOT"
  PREV_COMMIT="$(git rev-parse HEAD)"
  git reset --hard "$prev"
  maintenance_on
  build_api
  maintenance_off
  deploy_admin
  post_checks
  record
  bold $'\n'"Code is back on $(git log -1 --format='%h %s')."
  printf '%s\n' "Migrations were NOT undone. If the database must go back too, restore the backup taken before that deploy:"
  if [[ "$backup" == *.dump ]]; then
    printf '  PGPASSWORD=... pg_restore --clean --if-exists -h <host> -U <user> -d <database> %s\n' "$backup"
  elif [[ "$backup" == *.sql.gz ]]; then
    printf '  gunzip -c %s | mysql -h <host> -u <user> -p <database>\n' "$backup"
  elif [[ "$backup" != - ]]; then
    printf '  cp %s <the sqlite file>\n' "$backup"
  fi
}

case "${1:-}" in
  "") deploy ;;
  --rollback) rollback ;;
  --check) preflight; post_checks ;;
  -h | --help) trap - ERR; usage ;;
  *) trap - ERR; usage; exit 2 ;;
esac
