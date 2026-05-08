<?php

namespace App\Http\Requests\Interval;

use App\Http\Requests\AuthorizesAfterValidation;
use App\Http\Requests\CattrFormRequest;
use App\Models\TimeInterval;

class EditTimeIntervalRequest extends CattrFormRequest
{
    use AuthorizesAfterValidation;

    public function authorizeValidated(): bool
    {
        return $this->user()->can('update', TimeInterval::find((int) request('id')));
    }

    public function _rules(): array
    {
        return [
            'id'       => 'required|int|exists:time_intervals,id',
            'start_at' => 'required|date',
            'end_at'   => 'required|date|after:start_at',
        ];
    }
}
