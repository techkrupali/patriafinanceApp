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
        :root { --brand: #0B5D4B; --deep: #08392F; --mint: #DFF3EA; --surface: #F3F7F4; --ink: #0E1A16; --muted: #3D5249; --line: #D3E3DA; --gold: #F2A93B; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--surface); color: var(--ink); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.45; }
        main { max-width: 440px; margin: 0 auto; padding: 24px 16px 40px; }
        .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; color: var(--deep); margin-bottom: 20px; }
        .brand i { width: 28px; height: 28px; border-radius: 8px; background: var(--brand); display: inline-block; }
        h1 { font-size: 26px; line-height: 1.2; letter-spacing: -0.5px; margin: 0 0 6px; }
        p { margin: 0; }
        .muted { color: var(--muted); }
        .card { background: #fff; border-radius: 18px; padding: 16px; margin-top: 16px; }
        .dark { background: var(--deep); color: #fff; }
        .dark .muted { color: #CFE3DA; }
        .big { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
        .bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.18); margin: 12px 0 8px; overflow: hidden; }
        .bar span { display: block; height: 8px; background: var(--gold); }
        .row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
        .row:last-child { border-bottom: 0; }
        .acct { font-family: ui-monospace, Menlo, monospace; font-size: 22px; font-weight: 700; letter-spacing: 1px; }
        .note { margin-top: 16px; padding: 12px 14px; border-radius: 14px; background: #E1ECF9; font-size: 14px; }
    </style>
</head>
<body>
<main>
    <div class="brand"><i></i>Patriai</div>

    <h1>{{ $wallet->name }}</h1>
    <p class="muted">{{ $owner?->fullName() ?? 'A family' }} is saving for this{{ $goal['for'] ? ' — ' . $goal['for'] : '' }}. You can add money too.</p>

    <div class="card dark">
        <p class="muted">Saved so far</p>
        <p class="big">{{ $balance }}</p>
        @if ($target)
            <div class="bar"><span style="width: {{ $percent }}%"></span></div>
            <p class="muted">{{ $percent }}% of {{ $target }}{{ $due ? ' · due ' . $due : '' }}</p>
        @endif
    </div>

    @if (!empty($goal['lines']))
        <div class="card">
            <strong>What it covers</strong>
            @foreach ($goal['lines'] as $line)
                <div class="row"><span>{{ $line['name'] }}</span><strong>₦{{ number_format($line['amount'] / 100) }}</strong></div>
            @endforeach
        </div>
    @endif

    <div class="card">
        <strong>Add money by bank transfer</strong>
        @if ($account_number)
            <p class="muted" style="margin-top: 8px">Account number</p>
            <p class="acct">{{ $account_number }}</p>
            <div class="row"><span class="muted">Bank</span><strong>{{ $bank ?? '—' }}</strong></div>
            <div class="row"><span class="muted">Name</span><strong>{{ $wallet->name }}</strong></div>
        @else
            <p class="muted" style="margin-top: 8px">The account number is being set up. Please check back soon.</p>
        @endif
    </div>

    <div class="note">Money you send goes straight into this goal. {{ $owner?->first_name ?? 'The owner' }} sees every payment.</div>
</main>
</body>
</html>
