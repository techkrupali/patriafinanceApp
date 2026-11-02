<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A child's own phone (CHW-06) reaches only the child's app: their home, asks,
 * goal, tasks and notifications. Everything else is a parent's.
 */
class ChildScope
{
    private const ALLOWED = [
        'api/v1/auth/me',
        'api/v1/auth/logout',
        // SYS-05 the app lock on the child's phone checks the child's own PIN.
        'api/v1/profile/verify-pin',
        'api/v1/child/*',
        'api/v1/notifications',
        'api/v1/notifications/*',
        'api/v1/wallets/*/spend-requests',
        'api/v1/tasks/*/done',
        'api/v1/users/search',
        // CHD-04 who gets the money: a bank account, checked by name.
        'api/v1/banks',
        'api/v1/banks/verify-account',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->isChild() && !$request->is(...self::ALLOWED)) {
            return response()->json(['status' => false, 'message' => 'Ask a parent to do this from their phone.', 'data' => ['code' => 'child_account']], 403);
        }

        return $next($request);
    }
}
