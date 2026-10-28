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
        .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; color: var(--deep); margin-bottom: 20px; }
        .brand i { width: 28px; height: 28px; border-radius: 8px; background: var(--brand); display: inline-block; }
        h1 { font-size: 26px; line-height: 1.2; letter-spacing: -0.5px; margin: 0 0 8px; }
        p { margin: 0; }
        .muted { color: var(--muted); }
        .card { background: #fff; border-radius: 18px; padding: 16px; margin-top: 16px; }
        .dark { background: var(--deep); color: #fff; }
        .dark .muted { color: #CFE3DA; }
        .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
        .row:last-child { border-bottom: 0; }
        .chip { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--mint); color: var(--brand); }
        .chip.warn { background: #FDEBC8; color: #8F5400; }
        label { display: block; font-weight: 600; font-size: 13px; margin: 14px 0 6px; }
        textarea, input[type=file] { width: 100%; font: inherit; border: 1.5px solid #6F8A7E; border-radius: 12px; padding: 12px; background: #fff; }
        textarea { min-height: 96px; resize: vertical; }
        button { margin-top: 18px; width: 100%; height: 52px; border: 0; border-radius: 12px; background: var(--brand); color: #fff; font: inherit; font-weight: 700; font-size: 16px; }
        .note { margin-top: 16px; padding: 12px 14px; border-radius: 14px; background: #E1ECF9; font-size: 14px; }
        .ok { background: var(--mint); color: var(--deep); }
        .error { background: #FBE3DD; color: var(--danger); }
    </style>
</head>
<body>
<main>
    <div class="brand"><i></i>Patriai</div>

    <h1>{{ $wallet->name }}</h1>
    <p class="muted">Hi {{ $contact->name }}. {{ $owner?->fullName() ?? 'The owner' }} added you as a trusted contact. If they can't ask for help themselves, you can ask for this fund to be released.</p>

    @if (session('status'))
        <div class="note ok">{{ session('status') }}</div>
    @endif
    @if ($errors->any())
        <div class="note error">{{ $errors->first() }}</div>
    @endif

    <div class="card dark">
        <div class="row" style="border-color: rgba(255,255,255,0.15)">
            <span class="muted">Status</span>
            <strong>{{ $locked ? 'Locked — waiting for an emergency' : 'Released' }}</strong>
        </div>
        @if ($balance)
            <div class="row" style="border-color: rgba(255,255,255,0.15)">
                <span class="muted">In the fund</span>
                <strong>{{ $balance }}</strong>
            </div>
        @endif
        <div class="row">
            <span class="muted">For</span>
            <strong>{{ collect($purposes)->map(fn ($p) => ['medical' => 'Medical', 'funeral' => 'Funeral', 'travel' => 'Travel', 'legal' => 'Legal help', 'other' => 'Other'][$p] ?? $p)->join(', ') }}</strong>
        </div>
    </div>

    @if ($pending)
        <div class="card">
            <span class="chip warn">Waiting for the keyholders</span>
            <p style="margin-top: 8px">{{ count($pending->approvals ?? []) }} of {{ $pending->required_approvals ?? 2 }} keyholders have said yes{{ $pending->expires_at ? ' · expires ' . $pending->expires_at->timezone('Africa/Lagos')->format('j M, g:i a') . ' WAT' : '' }}.</p>
            @if ($pending->document_path)
                <p class="muted" style="margin-top: 4px">Proof is attached.</p>
            @endif
        </div>
    @elseif ($mine)
        <div class="card">
            <span class="chip">Your last request: {{ ['approved' => 'released', 'rejected' => 'declined', 'expired' => 'expired', 'cancelled' => 'cancelled'][$mine->status] ?? $mine->status }}</span>
            <p class="muted" style="margin-top: 8px">Sent {{ $mine->created_at->timezone('Africa/Lagos')->format('j M Y, g:i a') }} WAT.</p>
        </div>
    @endif

    @if ($can_request || $can_upload)
        <form class="card" method="post" action="/e/{{ $token }}" enctype="multipart/form-data">
            @csrf
            <strong>{{ $pending ? 'Add proof to the request' : 'Ask for a release' }}</strong>
            @if (!$pending)
                <label for="note">What happened?</label>
                <textarea id="note" name="note" maxlength="500" placeholder="Papa was admitted at Mercy Hospital this morning">{{ old('note') }}</textarea>
            @endif
            @if ($can_upload)
                <label for="proof">Photo of the bill or doctor's note{{ $pending ? '' : ' (optional)' }}</label>
                <input id="proof" type="file" name="proof" accept="image/*,application/pdf" {{ $pending ? 'required' : '' }}>
            @endif
            <button type="submit">{{ $pending ? 'Add proof' : 'Ask the keyholders' }}</button>
        </form>
    @elseif (!$locked)
        <div class="note ok">This fund has already been released.</div>
    @endif

    <div class="note">The keyholders still decide. Money is never released by one person alone.</div>
</main>
</body>
</html>
