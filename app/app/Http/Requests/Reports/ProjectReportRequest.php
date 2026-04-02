<?php

namespace App\Http\Requests\Reports;

use App\Http\Requests\CattrFormRequest;

class ProjectReportRequest extends CattrFormRequest
{
    public function _authorize(): bool
    {
        // Any authenticated user can access the report endpoint.
        // Data is scoped to own records for employees via UserAccessScope and
        // TimeIntervalAccessScope — no cross-user data leaks at the query level.
        return auth()->check();
    }

    public function _rules(): array
    {
        return [
            'users' => 'nullable|exists:users,id|array',
            'projects' => 'nullable|exists:projects,id|array',
            'start_at' => 'required|date',
            'end_at' => 'required|date',
        ];
    }
}
