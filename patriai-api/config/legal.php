<?php

/*
| ME-19 Legal. The wording here is a plain summary for the app; the full,
| signed-off texts come from Patriai's legal team and replace these bodies.
| "[Partner bank]" and "RC [number]" stay as on the client prototype until the
| partner bank and company registration are confirmed.
*/

return [
    'company' => 'Patriai Technologies Ltd, RC [number]. Banking services provided by [Partner bank], licensed by the Central Bank of Nigeria. Deposits insured by NDIC up to the legal limit.',

    'documents' => [
        'terms' => [
            'title' => 'Terms of use',
            'sub' => 'Updated 1 Oct 2026',
            'updated' => '2026-10-01',
            'body' => "These terms cover your Patriai account, its wallets, and how money moves between the people in them.\n\nYou keep your PIN to yourself. Payments you approve with your PIN or Face ID count as yours.\n\nWallet rules (approvals, limits, locks) are agreed by the wallet's owners and apply to everyone in it.\n\nThe full terms are provided by Patriai's legal team.",
        ],
        'privacy' => [
            'title' => 'Privacy policy',
            'sub' => 'Updated 1 Oct 2026',
            'updated' => '2026-10-01',
            'body' => "Under Nigeria's Data Protection Act you choose what we use. We use your BVN and NIN only to verify you, and your selfie only to check it's you.\n\nSteward reads your transactions only if you allow it, and never shares them. You can download everything we hold, or close your account, from Privacy and data.\n\nWe keep transaction records for 6 years, as the law requires.\n\nThe full policy is provided by Patriai's legal team.",
        ],
        'deposit_protection' => [
            'title' => 'Deposit protection',
            'sub' => 'Your money is held by [Partner bank]',
            'updated' => null,
            'body' => "Your money is held by [Partner bank], licensed by the Central Bank of Nigeria. Deposits are insured by NDIC up to the legal limit.",
        ],
        'complaints' => [
            'title' => 'Complaints',
            'sub' => 'How we handle them, and the CBN route',
            'updated' => null,
            'body' => "Tell us in Chat with support or by phone. We reply within 24 hours and aim to resolve within 72 hours.\n\nIf you're not happy with our answer, you can take it to the Central Bank of Nigeria's Consumer Protection Department.",
        ],
        'licences' => [
            'title' => 'Open-source licences',
            'sub' => 'Software we build on',
            'updated' => null,
            'body' => "Patriai is built with open-source software including React Native, Expo and Laravel, used under their licences (MIT and others).",
        ],
    ],
];
