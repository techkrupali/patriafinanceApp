<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** DSP-04 evidence on a dispute: photos, a video or a document, from either side. */
class DisputeFile extends Model
{
    protected $fillable = ['dispute_id', 'user_id', 'kind', 'url', 'name'];

    public function dispute(): BelongsTo
    {
        return $this->belongsTo(Dispute::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
