<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Requests\Project\CreateProjectRequest;
use App\Http\Requests\Project\EditProjectRequest;
use App\Http\Requests\Project\DestroyProjectRequest;
use App\Http\Requests\Project\GanttDataRequest;
use App\Http\Requests\Project\ListProjectRequest;
use App\Http\Requests\Project\PhasesRequest;
use App\Http\Requests\Project\ShowProjectRequest;
use App\Services\ProjectMemberService;
use CatEvent;
use Filter;
use App\Models\Project;
use Exception;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use DB;
use Staudenmeir\LaravelAdjacencyList\Eloquent\Builder as AdjacencyListBuilder;
use Throwable;

class ProjectController extends ItemController
{
    protected const MODEL = Project::class;

    public function index(ListProjectRequest $request): JsonResponse
    {
        return $this->_index($request);
    }

    public function ganttData(GanttDataRequest $request): JsonResponse
    {
        Filter::listen(Filter::getQueryFilterName(), static fn(Builder $query) => $query->with([
            'tasks' => fn(HasMany $queue) => $queue
                ->orderBy('start_date')
                ->select([
                    'id',
                    'task_name',
                    'priority_id',
                    'status_id',
                    'estimate',
                    'start_date',
                    'due_date',
                    'project_phase_id',
                    'project_id'
                ])->with(['status', 'priority'])
                ->withSum(['workers as total_spent_time'], 'duration')
                ->withSum(['workers as total_offset'], 'offset')
                ->withCasts(['start_date' => 'string', 'due_date' => 'string'])
                ->whereNotNull('start_date')->whereNotNull('due_date'),
            'phases' => fn(HasMany $queue) => $queue
                ->select(['id', 'name', 'project_id'])
                ->withMin([
                    'tasks as start_date' => fn(AdjacencyListBuilder $q) => $q
                        ->whereNotNull('start_date')
                        ->whereNotNull('due_date')
                ], 'start_date')
                ->withMax([
                    'tasks as due_date' => fn(AdjacencyListBuilder $q) => $q
                        ->whereNotNull('start_date')
                        ->whereNotNull('due_date')
                ], 'due_date'),
        ]));

        Filter::listen(Filter::getActionFilterName(), static function (Project $item) {
            $item->append('tasks_relations');
            return $item;
        });

        return $this->_show($request);
    }

    public function phases(PhasesRequest $request): JsonResponse
    {
        Filter::listen(
            Filter::getQueryFilterName(),
            static fn(Builder $query) => $query
                ->with([
                    'phases' => fn(HasMany $q) => $q->withCount('tasks')
                ])
        );

        return $this->_show($request);
    }

    public function show(ShowProjectRequest $request): JsonResponse
    {
        Filter::listen(
            Filter::getQueryFilterName(),
            static fn(Builder $query) => $query
                ->with([
                    'phases' => fn(HasMany $q) => $q->withCount('tasks')
                ])
        );
        return $this->_show($request);
    }

    public function create(CreateProjectRequest $request): JsonResponse
    {
        // C-002: capture creator identity as plain integers now, before any closures run,
        // to avoid Octane auth-guard state bleed inside callbacks.
        $creatorId = (int) $request->user()->id;

        Filter::listen(Filter::getRequestFilterName(), static function ($requestData) {
            if (isset($requestData['group']) && is_array($requestData['group'])) {
                $requestData['group'] = $requestData['group']['id'];
            }

            return $requestData;
        });

        CatEvent::listen(Filter::getAfterActionEventName(), static function (Project $project, $requestData) use ($request) {
            if ($request->has('statuses')) {
                $statuses = [];
                foreach ($request->get('statuses') as $status) {
                    $statuses[$status['id']] = ['color' => $status['color']];
                }

                $project->statuses()->sync($statuses);
            }

            if (isset($requestData['phases'])) {
                $project->phases()->createMany($requestData['phases']);
            }
        });

        // C-002: auto-add the creator as a project member after the item is created.
        // Use $data directly (the already-loaded Project model) rather than Project::findOrFail
        // because global scopes on Project would filter it out and throw "No query results".
        // Use MANAGER role (1) in the pivot so hasProjectRole(ANY) recognises the membership —
        // the upstream only checks MANAGER/AUDITOR pivot roles, not the global USER (2) role.
        Filter::listen(Filter::getActionFilterName(), static function ($data) use ($creatorId) {
            $data->users()->sync([$creatorId => ['role_id' => Role::MANAGER->value]]);
            // C-002: bust the Octane role cache so hasProjectRole sees the new membership
            // on the immediately-following show/task-create requests.
            \Cache::store('octane')->forget("role_project_$creatorId");
            \Cache::store('octane')->forget("role_any_project_$creatorId");
            return $data->load('statuses');
        });

        return $this->_create($request);
    }

    public function edit(EditProjectRequest $request): JsonResponse
    {
        Filter::listen(Filter::getRequestFilterName(), static function ($requestData) {
            if (isset($requestData['group']) && is_array($requestData['group'])) {
                $requestData['group'] = $requestData['group']['id'];
            }

            return $requestData;
        });

        CatEvent::listen(Filter::getAfterActionEventName(), static function (Project $project, $requestData) use ($request) {
            if ($request->has('statuses')) {
                $statuses = [];
                foreach ($request->get('statuses') as $status) {
                    $statuses[$status['id']] = ['color' => $status['color']];
                }

                $project->statuses()->sync($statuses);
            }

            if (isset($requestData['phases'])) {
                $phases = collect($requestData['phases']);
                $project->phases()
                    ->whereNotIn('id', $phases->pluck('id')->filter())
                    ->delete();
                $project->phases()->upsert(
                    $phases->filter(fn(array $val) => isset($val['id']))->toArray(),
                    ['id'],
                    ['name']
                );
                $project->phases()->createMany($phases->filter(fn(array $val) => !isset($val['id'])));
            }
        });

        Filter::listen(Filter::getActionFilterName(), static fn($data) => $data->load('statuses'));

        return $this->_edit($request);
    }

    public function destroy(DestroyProjectRequest $request): JsonResponse
    {
        return $this->_destroy($request);
    }

    public function count(ListProjectRequest $request): JsonResponse
    {
        return $this->_count($request);
    }
}