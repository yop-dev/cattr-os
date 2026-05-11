<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class TrackingSessionController extends Controller
{
    private function key($userId): string
    {
        return "tracking_session_{$userId}";
    }

    public function current(Request $request)
    {
        $session = Cache::get($this->key($request->user()->id));
        return response()->json(['data' => $session]);
    }

    public function start(Request $request)
    {
        $request->validate([
            'task_id' => 'required|integer',
            'start_at' => 'required|string',
            'owner'    => 'required|in:web,desktop',
        ]);

        $task = \App\Models\Task::withoutGlobalScopes()
            ->with('project')
            ->findOrFail($request->task_id);

        $session = [
            'task_id'      => $task->id,
            'task_name'    => $task->task_name,
            'project_id'   => optional($task->project)->id,
            'project_name' => optional($task->project)->name,
            'start_at'     => $request->start_at,
            'owner'        => $request->owner,
        ];

        Cache::put($this->key($request->user()->id), $session, 86400);

        return response()->json(['data' => $session]);
    }

    public function stop(Request $request)
    {
        Cache::forget($this->key($request->user()->id));
        return response()->json(['data' => null]);
    }
}
