<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>{{ $first }} asked you for {{ $amount }} · Patriai</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root { --brand: #0B5D4B; --deep: #08392F; --mint: #DFF3EA; --surface: #F3F7F4; --ink: #0E1A16; --muted: #3D5249; --line: #D3E3DA; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--surface); color: var(--ink); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.45; }
        main { max-width: 440px; margin: 0 auto; padding: 32px 16px 40px; text-align: center; }
        .avatar { width: 64px; height: 64px; border-radius: 32px; background: var(--brand); color: #fff; font-weight: 800; font-size: 22px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
        h1 { font-size: 40px; letter-spacing: -1px; margin: 4px 0; }
        p { margin: 0; }
        .muted { color: var(--muted); }
        .card { background: #fff; border-radius: 16px; padding: 16px; margin-top: 18px; text-align: left; }
        .row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
        .row:last-child { border-bottom: 0; }
        .acct { font-family: ui-monospace, Menlo, monospace; font-size: 22px; font-weight: 700; letter-spacing: 1px; }
        .code { font-family: ui-monospace, Menlo, monospace; font-weight: 800; }
        .btn { display: block; margin-top: 22px; padding: 15px; border-radius: 14px; background: var(--brand); color: #fff; font-weight: 700; text-decoration: none; }
        .note { margin-top: 16px; padding: 12px 14px; border-radius: 14px; background: #E1ECF9; font-size: 14px; text-align: left; }
        .done { margin-top: 18px; padding: 14px; border-radius: 14px; background: var(--mint); color: var(--deep); font-weight: 700; }
    </style>
</head>
<body>
<main>
    <div class="avatar">{{ strtoupper(mb_substr($first, 0, 1)) }}</div>
    <p class="muted"><strong style="color: var(--ink)">{{ $request->requester->fullName() }}</strong> asked you for</p>
    <h1>{{ $amount }}</h1>
    @if ($request->note)
        <p class="muted">"{{ $request->note }}"</p>
    @endif

    @if ($request->status !== 'pending')
        <div class="done">{{ $request->status === 'paid' ? 'This request is paid. Thank you!' : 'This request is closed. Nothing to pay.' }}</div>
    @else
        <a class="btn" id="open" href="{{ $appUrl }}">Pay in Patriai</a>

        <div class="card">
            <strong>Or pay by bank transfer</strong>
            @if ($account_number)
                <p class="muted" style="margin-top: 8px">Account number</p>
                <p class="acct">{{ $account_number }}</p>
                <div class="row"><span class="muted">Bank</span><strong>{{ $bank ?? '—' }}</strong></div>
                <div class="row"><span class="muted">Name</span><strong>{{ $account_name }}</strong></div>
                <div class="row"><span class="muted">Narration</span><strong class="code">{{ $request->code }}</strong></div>
                @if ($request->due_on)
                    <div class="row"><span class="muted">Due</span><strong>{{ $request->due_on->format('l, j M') }}</strong></div>
                @endif
            @else
                <p class="muted" style="margin-top: 8px">The account number is being set up. Please check back soon.</p>
            @endif
        </div>
        <div class="note">Put <span class="code">{{ $request->code }}</span> in the narration so {{ $first }} sees it's you. It goes into {{ $request->wallet?->name ?? 'their wallet' }}.</div>
    @endif
</main>
<script>
    // Chrome on Android opens apps through an intent link.
    var open = document.getElementById('open');
    if (open && /android/i.test(navigator.userAgent)) open.href = @json($androidUrl, JSON_UNESCAPED_SLASHES);
</script>
</body>
</html>
