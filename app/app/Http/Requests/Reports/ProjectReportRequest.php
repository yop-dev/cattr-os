<?php

namespace App\Http\Requests\Reports;

use App\Enums\Role;
use App\Http\Requests\CattrFormRequest;

class ProjectReportRequest extends CattrFormRequest
{
    public function _authorize(): bool
    {
        // C-002 side-effect fix: upstream only checked auth()->check(), allowing any
        // authenticated user (including employees with project MANAGER role from C-002)
        // to access cross-user report data. Restrict to global ADMIN/MANAGER/AUDITOR.
        return $this->user()->hasRole([Role::ADMIN, Role::MANAGER, Role::AUDITOR]);
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
