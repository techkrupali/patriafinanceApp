<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>{{ $wallet->name }} · Patriai</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root { --brand: #0B5D4B; --deep: #08392F; --mint: #DFF3EA; --surface: #F3F7F4; --ink: #0E1A16; --muted: #3D5249; --line: #D3E3DA; --danger: #B3311A; --gold: #F2A93B; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--surface); color: var(--ink); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.45; }
        main { max-width: 440px; margin: 0 auto; padding: 24px 16px 40px; }
        .url { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 22px; }
        .who { display: flex; gap: 14px; align-items: center; }
        .avatar { flex: none; width: 52px; height: 52px; border-radius: 26px; background: var(--gold); color: #2A1B00; display: flex; align-items: center; justify-content: center; font-weight: 800; }
        h1 { font-size: 20px; line-height: 1.35; margin: 0; font-weight: 600; color: var(--muted); }
        h1 b { color: var(--ink); font-weight: 800; }
        .chip { display: inline-block; margin: 18px 0 14px; padding: 4px 12px; border-radius: 999px; background: var(--mint); color: var(--brand); font-weight: 700; font-size: 13px; }
        .card { background: #fff; border-radius: 18px; padding: 6px 18px; }
        .card div { padding: 12px 0; border-bottom: 1px solid var(--line); }
        .card div:last-child { border-bottom: 0; }
        .no { color: var(--muted); }
        label { display: block; font-weight: 600; font-size: 13px; margin: 18px 0 6px; }
        input { width: 100%; font: inherit; font-size: 22px; letter-spacing: 6px; text-align: center; border: 1.5px solid #6F8A7E; border-radius: 12px; padding: 12px; background: #fff; }
        .muted { color: var(--muted); font-size: 14px; margin: 8px 0 0; }
        button { margin-top: 16px; width: 100%; height: 52px; border: 0; border-radius: 12px; background: var(--brand); color: #fff; font: inherit; font-weight: 700; font-size: 16px; }
        .ghost { background: transparent; color: var(--brand); margin-top: 6px; }
        .error { margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: #FBE3DD; color: var(--danger); font-size: 14px; }
        .h2 { font-size: 24px; font-weight: 800; color: var(--ink); margin: 24px 0 8px; }
    </style>
</head>
<body>
<main>
    <div class="url">{{ preg_replace('#^https?://#', '', rtrim(config('app.url'), '/')) }}/e/…</div>
@if ($state === 'declined')
    <p class="h2">You're not a trusted contact</p>
    <p class="muted">We've told {{ $owner?->first_name ?? 'them' }}. If that was a mistake, ask {{ $owner?->first_name ?? 'them' }} to add you again.</p>
@else
    <div class="who">
        <div class="avatar">{{ collect(explode(' ', (string) $owner?->fullName()))->map(fn ($w) => mb_substr($w, 0, 1))->take(2)->join('') }}</div>
        <h1><b>{{ $owner?->fullName() ?? 'Someone' }}</b> added you as a trusted contact for <b>{{ $wallet->name }}</b>.</h1>
    </div>
    <span class="chip">You: Trusted contact</span>
    <div class="card">
        <div>If {{ $owner?->first_name ?? 'they' }} can't, you can start a request for money, with a bill or note</div>
        <div>No app needed. We send you a secure link by SMS</div>
        <div class="no">{{ $can_see_balance ? "You can see the balance, but you can't release money" : "You can't see the balance or release money" }}</div>
    </div>
    @if ($errors->any())<div class="error">{{ $errors->first() }}</div>@endif
    <form method="post" action="/e/{{ $token }}/accept">
        @csrf
        <label for="code">Code sent to {{ $masked }}</label>
        <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
        <button type="submit">Accept</button>
    </form>
    <form method="post" action="/e/{{ $token }}/decline">
        @csrf
        <button type="submit" class="ghost">Decline</button>
    </form>
@endif
</main>
</body>
</html>
