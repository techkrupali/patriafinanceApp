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
        :root { --brand: #0B5D4B; --deep: #08392F; --mint: #DFF3EA; --surface: #F3F7F4; --ink: #0E1A16; --muted: #3D5249; --gold: #F2A93B; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--surface); color: var(--ink); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.45; }
        main { max-width: 440px; margin: 0 auto; padding: 48px 16px 40px; text-align: center; }
        .mark { width: 64px; height: 64px; margin: 0 auto 20px; }
        h1 { font-size: 24px; line-height: 1.25; letter-spacing: -0.5px; margin: 0 0 8px; }
        p { margin: 0; color: var(--muted); }
        .btn { display: block; margin-top: 28px; padding: 15px; border-radius: 14px; background: var(--brand); color: #fff; font-weight: 700; text-decoration: none; }
        .note { margin-top: 16px; font-size: 13px; }
    </style>
</head>
<body>
<main>
    <svg class="mark" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r="36" fill="none" stroke="#0B5D4B" stroke-width="8"/>
        <circle cx="44" cy="58" r="22" fill="none" stroke="#1FA07A" stroke-width="8"/>
        <circle cx="44" cy="66" r="10" fill="#F2A93B"/>
    </svg>
    <h1>{{ $title }}</h1>
    <p>{{ $body }}</p>
    <a class="btn" id="open" href="{{ $appUrl }}">Open in Patriai</a>
    <p class="note">Don't have the app yet? Install Patriai, then tap this link again.</p>
</main>
<script>
    // Chrome on Android opens apps through an intent link.
    if (/android/i.test(navigator.userAgent)) document.getElementById('open').href = @json($androidUrl, JSON_UNESCAPED_SLASHES);
</script>
</body>
</html>
