<?php

namespace App\Http\Controllers;

use App\Services\GoalService;
use Illuminate\View\View;

/**
 * GLW-04 "Contribution link — patriai.app/g/okafor-fees: anyone with the link
 * can add money, like Uncle Obi". The goal, how close it is, and the account to
 * pay into. No app or account needed.
 */
class GoalLinkController extends Controller
{
    // GET /g/{slug}
    public function show(string $slug): View
    {
        $view = GoalService::make()->publicView($slug) ?? abort(404);

        return view('goal.link', $view);
    }
}
