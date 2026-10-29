<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportMessage;
use App\Models\SupportRequest;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Services\SupportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ME-17 Chat with support: one open conversation per person, kept on a
 * support request so the admin team answers it from the Support page. ME-18
 * "Someone tricked me into sending money" opens it as fraud, at high priority.
 */
class SupportChatController extends ApiController
{
    private function open(Request $request): ?SupportRequest
    {
        return SupportRequest::where('user_id', $request->user()->id)->whereIn('status', ['pending', 'in_review'])->latest()->first();
    }

    public static function serializeMessage(SupportMessage $m): array
    {
        return [
            'id' => $m->id,
            'from' => $m->from,
            'name' => $m->from === 'support' ? ($m->sender?->first_name ?: 'Patriai support') : $m->sender?->first_name,
            'body' => $m->body,
            'reference' => $m->reference,
            'created_at' => $m->created_at?->toIso8601String(),
        ];
    }

    // GET /support/chat
    public function show(Request $request): JsonResponse
    {
        $open = $this->open($request);

        return $this->ok('Support chat', [
            'request' => $open ? ['id' => $open->id, 'subject' => $open->subject, 'status' => $open->status, 'category' => $open->category] : null,
            'messages' => $open ? $open->messages()->with('sender')->get()->map(fn ($m) => self::serializeMessage($m)) : [],
            'replies_in' => '5 min',
            'phone' => SystemSetting::get('support_phone'),
        ]);
    }

    // POST /support/chat  { body, reference?, category? }
    public function send(Request $request): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:2000'],
            'reference' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'in:fraud,transfer,withdrawal,wallet,account,transaction,other'],
        ]);
        $user = $request->user();
        // Only your own transactions can be shared into the chat.
        if (!empty($data['reference']) && !Transaction::where('reference', $data['reference'])->where(fn ($q) => $q->where('user_id', $user->id)->orWhereIn('wallet_id', $user->wallets()->pluck('id')))->exists()) {
            return $this->fail('Transaction not found', 404);
        }
        $open = $this->open($request);
        if (!$open) {
            $open = SupportService::make()->create($user, [
                'subject' => ($data['category'] ?? null) === 'fraud' ? 'Someone tricked me into sending money' : mb_strimwidth($data['body'], 0, 80, '…'),
                'description' => $data['body'],
                'category' => ($data['category'] ?? null) === 'fraud' ? 'transaction' : ($data['category'] ?? 'other'),
                'reference' => $data['reference'] ?? null,
            ])['request'];
            if (($data['category'] ?? null) === 'fraud') {
                $open->update(['priority' => 'high']);
            }
        }
        $message = SupportMessage::create([
            'support_request_id' => $open->id,
            'sender_id' => $user->id,
            'from' => 'user',
            'body' => $data['body'],
            'reference' => $data['reference'] ?? null,
        ]);

        return $this->ok('Sent', ['message' => self::serializeMessage($message->load('sender')), 'request_id' => $open->id], 201);
    }
}
