<?php

namespace App\Services\Assistant;

use App\Services\Assistant\Contracts\AssistantTool;
use App\Services\Assistant\Tools\AppKnowledgeTool;
use App\Services\Assistant\Tools\ApproveWithdrawalTool;
use App\Services\Assistant\Tools\CreateRuleTool;
use App\Services\Assistant\Tools\CreateSupportRequestTool;
use App\Services\Assistant\Tools\CreateTransferTool;
use App\Services\Assistant\Tools\CreateWalletTool;
use App\Services\Assistant\Tools\FindTransactionsTool;
use App\Services\Assistant\Tools\FlagTransactionTool;
use App\Services\Assistant\Tools\GroupTransactionsTool;
use App\Services\Assistant\Tools\GetWalletsTool;

/**
 * The set of tools exposed to the AI assistant.
 *
 * Add future read/write tools here (getWalletBalance, findTransactions, …) —
 * the service loop and the wire-format wiring stay unchanged.
 */
class ToolRegistry
{
    /** @var array<string,AssistantTool> keyed by wire name */
    private array $tools = [];

    public function __construct()
    {
        $this->register(new GetWalletsTool());
        $this->register(new AppKnowledgeTool());
        $this->register(new FindTransactionsTool());
        $this->register(new GroupTransactionsTool());
        $this->register(new CreateRuleTool());
        $this->register(new CreateWalletTool());
        $this->register(new CreateTransferTool());
        $this->register(new ApproveWithdrawalTool());
        $this->register(new FlagTransactionTool());
        $this->register(new CreateSupportRequestTool());
    }

    public function register(AssistantTool $tool): void
    {
        $this->tools[$tool->name()] = $tool;
    }

    public function get(string $name): ?AssistantTool
    {
        return $this->tools[$name] ?? null;
    }

    /** @return array<int,AssistantTool> */
    public function all(): array
    {
        return array_values($this->tools);
    }

    /** Anthropic Messages API tool definitions. */
    public function definitions(): array
    {
        return array_map(fn (AssistantTool $t) => [
            'name' => $t->name(),
            'description' => $t->description(),
            'input_schema' => $t->inputSchema(),
        ], $this->all());
    }
}
