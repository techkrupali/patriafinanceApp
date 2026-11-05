<?php

/*
 * ADD-05 USSD: transfer from your bank's USSD menu to the wallet's own account
 * number. {amount} and {account} are filled in by the app. These are the banks'
 * "transfer to another bank" codes — check them with each bank before launch;
 * the bank's menu then asks which bank (Assetmatrix MFB) and the bank PIN.
 */
return [
    'ussd' => [
        ['bank' => 'GTBank', 'code' => '*737*2*{amount}*{account}#'],
        ['bank' => 'Access Bank', 'code' => '*901*2*{amount}*{account}#'],
        ['bank' => 'Zenith Bank', 'code' => '*966*{amount}*{account}#'],
        ['bank' => 'First Bank', 'code' => '*894*{amount}*{account}#'],
    ],

    // ADD-06: agents further than this aren't "near you" (kilometres).
    'agent_radius_km' => 50,
];
