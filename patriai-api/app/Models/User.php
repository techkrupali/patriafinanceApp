<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /** Answers to "What brings you to Patriai?" (onboarding ONB-09). */
    public const ONBOARDING_PURPOSES = ['household', 'school_goals', 'project', 'ajo', 'children', 'vendor'];

    /**
     * Privilege fields (role, kyc_tier, status) are deliberately NOT fillable:
     * they must never be settable from a request-controlled array. The few
     * legitimate writers (admin endpoints, KYC approval, seeder) assign them
     * explicitly via property assignment / forceFill.
     */
    protected $fillable = [
        'first_name',
        'last_name',
        'name',
        'email',
        'phone',
        'password',
        'pin',
        'pin_length',
        'date_of_birth',
        'language',
        'onboarding_purposes',
        'avatar_url',
        'username',
        'referral_code',
        'referred_by',
    ];

    protected $hidden = [
        'password',
        'pin',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'kyc_tier' => 'integer',
            'pin_length' => 'integer',
            'date_of_birth' => 'date',
            'onboarding_purposes' => 'array',
        ];
    }

    public function wallets(): HasMany
    {
        return $this->hasMany(Wallet::class);
    }

    /** Wallets this user can access as a member (shared/project). */
    public function memberWallets(): BelongsToMany
    {
        return $this->belongsToMany(Wallet::class, 'wallet_members')
            ->withPivot(['role', 'status'])
            ->wherePivot('status', 'active');
    }

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /** In-app notifications feed (app_notifications table). Distinct from Notifiable's notifications(). */
    public function notificationsFeed(): HasMany
    {
        return $this->hasMany(AppNotification::class);
    }

    /** The user who referred this account (null if joined organically). */
    public function referrer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referred_by');
    }

    /** Accounts that joined using this user's referral code. */
    public function referrals(): HasMany
    {
        return $this->hasMany(User::class, 'referred_by');
    }

    public function mainWallet(): ?Wallet
    {
        return $this->wallets()->where('type', 'main')->first();
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function fullName(): string
    {
        return trim("{$this->first_name} {$this->last_name}") ?: ($this->name ?? '');
    }

    /**
     * Return this user's referral code, lazily generating a unique uppercase one
     * (and persisting it) the first time it's needed. Idempotent — returns the
     * existing code once set.
     */
    public function ensureReferralCode(): string
    {
        if ($this->referral_code) {
            return $this->referral_code;
        }

        do {
            $code = strtoupper(Str::random(7));
        } while (static::where('referral_code', $code)->exists());

        $this->referral_code = $code;
        $this->save();

        return $code;
    }

    /** A sanitized username base derived from a name: letters/digits, 3–20 chars. */
    public static function usernameBase(?string $name): string
    {
        $base = preg_replace('/[^a-z0-9]/', '', strtolower((string) $name));
        $base = substr($base, 0, 20);
        return strlen($base) >= 3 ? $base : 'user';
    }

    /**
     * Return this user's @username, lazily generating a unique one from their
     * name (deduped with a numeric suffix) and persisting it. Idempotent.
     */
    public function ensureUsername(): string
    {
        if ($this->username) {
            return $this->username;
        }

        $base = self::usernameBase(trim(($this->first_name ?? '') . ($this->last_name ?? '')) ?: $this->name);
        $candidate = $base;
        $n = 1;
        while (static::where('username', $candidate)->exists()) {
            $candidate = $base . $n;
            $n++;
        }

        $this->username = $candidate;
        $this->save();

        return $candidate;
    }
}
