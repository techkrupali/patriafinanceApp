<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>{{ $title }} · Patriai</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root { --brand: #0B5D4B; --deep: #08392F; --mint: #DFF3EA; --surface: #F3F7F4; --ink: #0E1A16; --muted: #3D5249; --gold: #F2A93B; --line: #DCE6E0; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--surface); color: var(--ink); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.45; }
        main { max-width: 440px; margin: 0 auto; padding: 24px 16px 40px; }
        .url { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 24px; }
        .who { display: flex; gap: 14px; align-items: center; }
        .avatar { flex: none; width: 52px; height: 52px; border-radius: 26px; background: var(--gold); color: #2A1B00; display: flex; align-items: center; justify-content: center; font-weight: 800; }
        h1 { font-size: 20px; line-height: 1.35; margin: 0; font-weight: 600; color: var(--muted); }
        h1 b { color: var(--ink); font-weight: 800; }
        .chip { display: inline-block; margin: 18px 0 14px; padding: 4px 12px; border-radius: 999px; background: var(--mint); color: var(--brand); font-weight: 700; font-size: 13px; }
        .card { background: #fff; border-radius: 18px; padding: 6px 18px; }
        .card div { padding: 12px 0; border-bottom: 1px solid var(--line); }
        .card div:last-child { border-bottom: 0; }
        .no { color: var(--muted); }
        .note { margin: 18px 0 0; color: var(--muted); font-size: 14px; }
        .btn { display: block; margin-top: 22px; padding: 15px; border-radius: 14px; background: var(--brand); color: #fff; font-weight: 700; text-decoration: none; text-align: center; }
        .ghost { display: block; margin-top: 10px; padding: 12px; color: var(--brand); font-weight: 700; text-decoration: none; text-align: center; }
        .center { text-align: center; }
        button.btn { width: 100%; border: 0; font: inherit; font-weight: 700; cursor: pointer; }
        .done { margin: 22px 0 0; padding: 14px; border-radius: 14px; background: var(--mint); color: var(--brand); font-weight: 700; }
        .err { margin: 18px 0 0; color: #B3261E; font-weight: 600; }
        .mark { width: 64px; height: 64px; margin: 24px auto 20px; display: block; }
        .h2 { font-size: 24px; line-height: 1.25; letter-spacing: -0.5px; margin: 0 0 8px; font-weight: 800; color: var(--ink); }
    </style>
</head>
<body>
<main>
    <div class="url">{{ $url }}</div>
@if ($state === 'open')
    <div class="who">
        <div class="avatar">{{ $initials }}</div>
        <h1><b>{{ $inviter }}</b> invited you to join <b>{{ $wallet }}</b>.</h1>
    </div>
    <span class="chip">You: {{ $role }}</span>
    <div class="card">
        @foreach ($can as $line)<div>{{ $line }}</div>@endforeach
        @foreach ($cannot as $line)<div class="no">{{ $line }}</div>@endforeach
    </div>
    @if ($note)<p class="note">“{{ $note }}”</p>@endif
    <p class="note">You'll need the Patriai app. It's free, and joining takes about 2 minutes.</p>
    <a class="btn" id="open" href="{{ $appUrl }}">Open in the Patriai app</a>
    <a class="ghost" id="decline" href="{{ $declineUrl }}">Decline</a>
@else
    <div class="center">
        <svg class="mark" viewBox="0 0 88 88" aria-hidden="true">
            <circle cx="44" cy="44" r="36" fill="none" stroke="#0B5D4B" stroke-width="8"/>
            <circle cx="44" cy="58" r="22" fill="none" stroke="#1FA07A" stroke-width="8"/>
            <circle cx="44" cy="66" r="10" fill="#F2A93B"/>
        </svg>
        <p class="h2">{{ $title }}</p>
        <p class="note">{{ $body }}</p>
        <p class="note">If the invite was meant for a different phone number, it won't open here. That keeps family wallets safe.</p>
        @if (session('asked'))
            <p class="done">We've told {{ $first }}. Their new invite will come by SMS.</p>
        @elseif ($canAsk)
            @if ($errors->any())<p class="err">{{ $errors->first() }}</p>@endif
            <form method="post" action="/i/{{ $code }}/ask">
                @csrf
                <button class="btn" type="submit">Ask {{ $first }} for a new invite</button>
            </form>
        @endif
        <a class="{{ $canAsk ? 'ghost' : 'btn' }}" id="open" href="{{ $appUrl }}">Open in the Patriai app</a>
    </div>
@endif
</main>
<script>
    // Chrome on Android opens apps through an intent link.
    if (/android/i.test(navigator.userAgent)) {
        document.getElementById('open').href = @json($androidUrl, JSON_UNESCAPED_SLASHES);
        var d = document.getElementById('decline'); if (d) d.href = @json($androidDeclineUrl, JSON_UNESCAPED_SLASHES);
    }
</script>
</body>
</html>
