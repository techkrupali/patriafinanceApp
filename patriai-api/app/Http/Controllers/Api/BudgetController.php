<?php

namespace App\Http\Controllers\Api;

use App\Models\BudgetCategory;
use App\Models\User;
use App\Models\Wallet;
use App\Services\AuditService;
use App\Services\BudgetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** WAL-09 "Spending limits": a spending wallet's budget this period, and editing its limits. */
class BudgetController extends ApiController
{
    // GET /wallets/{wallet}/budget
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user()) || !$wallet->budget()) {
            return $this->fail('Budget not found', 404);
        }

        return $this->ok('Budget fetched', ['budget' => BudgetService::make()->detail($wallet, $request->user())]);
    }

    // PATCH /wallets/{wallet}/budget/categories/{category}  {limit}
    public function updateCategory(Request $request, Wallet $wallet, BudgetCategory $category): JsonResponse
    {
        if (!$this->owns($request->user(), $wallet) || $category->wallet_id !== $wallet->id) {
            return $this->fail('Category not found', 404);
        }
        $data = $request->validate(['limit' => ['required', 'numeric', 'min:1']]);
        $limit = $this->toKobo((string) $data['limit']);
        $others = (int) $wallet->budgetCategories()->where('id', '!=', $category->id)->sum('limit');
        if ($others + $limit > (int) $wallet->budget()['amount']) {
            return $this->fail('The categories would add up to more than the budget', 422);
        }
        $category->update(['limit' => $limit]);
        AuditService::make()->log($wallet, $request->user(), 'budget_changed', "{$category->name} limit set to ₦" . number_format($limit / 100), ['category_id' => $category->id]);

        return $this->ok('Limit updated', ['budget' => BudgetService::make()->detail($wallet->refresh(), $request->user())]);
    }

    // PATCH /wallets/{wallet}/budget/spenders/{user}  {categories: [ids]|null, daily_limit: naira|null}
    public function updateSpender(Request $request, Wallet $wallet, User $user): JsonResponse
    {
        if (!$this->owns($request->user(), $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $member = $wallet->members()->where('user_id', $user->id)->where('status', 'active')->first();
        if (!$member || in_array($member->role, ['owner', 'viewer'], true)) {
            return $this->fail('Choose someone who spends from this wallet', 422);
        }
        $data = $request->validate([
            'categories' => ['present', 'nullable', 'array'],
            'categories.*' => ['integer'],
            'daily_limit' => ['present', 'nullable', 'numeric', 'min:1'],
        ]);
        $ids = $data['categories'] === null ? null : $wallet->budgetCategories()->whereIn('id', $data['categories'])->pluck('id')->all();
        if (is_array($ids) && count($ids) !== count(array_unique($data['categories']))) {
            return $this->fail("Choose this wallet's categories", 422);
        }
        $member->update(['permissions' => array_merge($member->permissions ?? [], [
            'categories' => $ids,
            'daily_limit' => $data['daily_limit'] !== null ? $this->toKobo((string) $data['daily_limit']) : null,
        ])]);
        AuditService::make()->log($wallet, $request->user(), 'budget_changed', "Spending limits changed for {$user->fullName()}", ['user_id' => $user->id]);

        return $this->ok('Limits updated', ['budget' => BudgetService::make()->detail($wallet->refresh(), $request->user())]);
    }

    /** Owners and co-owners manage the budget. */
    private function owns(User $user, Wallet $wallet): bool
    {
        if (!$wallet->budget()) {
            return false;
        }

        return $wallet->user_id === $user->id
            || $wallet->members()->where('user_id', $user->id)->where('status', 'active')->where('role', 'co_owner')->exists();
    }
}
