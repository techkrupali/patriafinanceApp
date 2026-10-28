<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * EMG-05 trusted contact: someone without the app (a family doctor, a cousin
 * near Mama and Papa) who gets an SMS with a secure link to ask for a release or
 * upload proof. Only the link token's hash is stored.
 */
class EmergencyTrustedContact extends Model
{
    protected $fillable = ['wallet_id', 'name', 'phone', 'relation', 'token_hash', 'link_sent_at'];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['link_sent_at' => 'datetime'];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    /** A new secret for the link; returns the plain token (stored only as a hash). */
    public function issueToken(): string
    {
        $token = Str::random(40);
        $this->token_hash = self::hash($token);

        return $token;
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function findByToken(string $token): ?self
    {
        return self::where('token_hash', self::hash($token))->first();
    }

    /** "0803 •••• 214" */
    public function maskedPhone(): string
    {
        $digits = preg_replace('/\D/', '', $this->phone);
        $local = str_starts_with($digits, '234') ? '0' . substr($digits, 3) : $digits;

        return strlen($local) >= 7 ? substr($local, 0, 4) . ' •••• ' . substr($local, -3) : $this->phone;
    }
}
