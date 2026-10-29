<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Verify as a director · Patriai</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root { --brand: #0B5D4B; --deep: #08392F; --mint: #DFF3EA; --surface: #F3F7F4; --ink: #0E1A16; --muted: #3D5249; --line: #D3E3DA; --danger: #B3311A; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--surface); color: var(--ink); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.45; }
        main { max-width: 440px; margin: 0 auto; padding: 24px 16px 40px; }
        .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; color: var(--deep); margin-bottom: 20px; }
        .brand i { width: 28px; height: 28px; border-radius: 8px; background: var(--brand); display: inline-block; }
        h1 { font-size: 26px; line-height: 1.2; letter-spacing: -0.5px; margin: 0 0 8px; }
        p { margin: 0; }
        .muted { color: var(--muted); }
        .card { background: #fff; border-radius: 18px; padding: 16px; margin-top: 16px; }
        label { display: block; font-weight: 600; font-size: 13px; margin: 14px 0 6px; }
        input[type=text], input[type=file] { width: 100%; font: inherit; border: 1.5px solid #6F8A7E; border-radius: 12px; padding: 12px; background: #fff; }
        button { margin-top: 18px; width: 100%; height: 52px; border: 0; border-radius: 12px; background: var(--brand); color: #fff; font: inherit; font-weight: 700; font-size: 16px; }
        .note { margin-top: 16px; padding: 12px 14px; border-radius: 14px; background: #E1ECF9; font-size: 14px; }
        .ok { background: var(--mint); color: var(--deep); }
        .error { background: #FBE3DD; color: var(--danger); }
    </style>
</head>
<body>
<main>
    <div class="brand"><i></i>Patriai</div>

    @if (session('status'))
        <h1>Details sent</h1>
        <div class="note ok">{{ session('status') }}</div>
    @elseif (!$director)
        <h1>This link has been used</h1>
        <p class="muted">If you still need to verify, ask the business owner to send you a new link from the Patriai app.</p>
    @else
        <h1>Verify as a director</h1>
        <p class="muted">Hi {{ $director->name }}. {{ $profile?->user?->first_name ?? 'The owner' }} listed you as a director{{ $director->share_percent ? ' with ' . $director->share_percent . '%' : '' }} of {{ $profile?->business_name }}. Patriai checks everyone who owns 25% or more before families can pay the business.</p>

        @if ($errors->any())
            <div class="note error">{{ $errors->first() }}</div>
        @endif

        <form class="card" method="post" action="/d/{{ $token }}" enctype="multipart/form-data">
            @csrf
            <label for="bvn">Your BVN</label>
            <input id="bvn" type="text" name="bvn" inputmode="numeric" maxlength="11" pattern="\d{11}" placeholder="11 digits" value="{{ old('bvn') }}" required>
            <label for="selfie">A selfie, face clearly visible</label>
            <input id="selfie" type="file" name="selfie" accept="image/*" capture="user" required>
            <button type="submit">Send for checking</button>
        </form>

        <div class="note">Your BVN is only used to confirm who you are. It is never shown to the business or to families.</div>
    @endif
</main>
</body>
</html>
