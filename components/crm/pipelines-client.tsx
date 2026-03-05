'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { currency } from '@/lib/utils';

type StageItem = {
  id: string;
  name: string;
  sortOrder: number;
  opportunities: OpportunityItem[];
};

type OpportunityItem = {
  id: string;
  name: string;
  status: 'OPEN' | 'WON' | 'LOST';
  value: number;
  account: { id: string; name: string };
  updatedAt: string;
};

export function PipelinesClient({ initialStages }: { initialStages: StageItem[] }) {
  const [stages, setStages] = useState<StageItem[]>(initialStages);
  const [search, setSearch] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [draggingOpportunityId, setDraggingOpportunityId] = useState<string | null>(null);

  const filteredStages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stages;
    return stages.map((stage) => ({
      ...stage,
      opportunities: stage.opportunities.filter((opportunity) =>
        [opportunity.name, opportunity.account.name, opportunity.status].join(' ').toLowerCase().includes(q),
      ),
    }));
  }, [search, stages]);

  function findStageIndexByOpportunity(opportunityId: string) {
    return stages.findIndex((stage) => stage.opportunities.some((opportunity) => opportunity.id === opportunityId));
  }

  async function moveOpportunityToStage(opportunityId: string, targetStageId: string) {
    const currentStageIndex = findStageIndexByOpportunity(opportunityId);
    if (currentStageIndex < 0) return;
    const nextStageIndex = stages.findIndex((stage) => stage.id === targetStageId);
    if (nextStageIndex < 0 || nextStageIndex >= stages.length) return;
    if (nextStageIndex === currentStageIndex) return;

    const fromStage = stages[currentStageIndex];
    const toStage = stages[nextStageIndex];

    const opportunity = fromStage.opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) return;

    setMovingId(opportunityId);

    // optimistic update
    setStages((current) =>
      current.map((stage, idx) => {
        if (idx === currentStageIndex) {
          return {
            ...stage,
            opportunities: stage.opportunities.filter((item) => item.id !== opportunityId),
          };
        }
        if (idx === nextStageIndex) {
          return {
            ...stage,
            opportunities: [{ ...opportunity }, ...stage.opportunities],
          };
        }
        return stage;
      }),
    );

    try {
      const response = await fetch(`/api/opportunities/${opportunityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: toStage.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to move opportunity');
      }

      setStages((current) =>
        current.map((stage) => {
          if (stage.id === toStage.id) {
            return {
              ...stage,
              opportunities: stage.opportunities.map((item) => (item.id === opportunityId ? { ...item, ...payload } : item)),
            };
          }
          return stage;
        }),
      );
      toast.success(`Moved to ${toStage.name}`);
    } catch (error) {
      // rollback
      setStages((current) =>
        current.map((stage, idx) => {
          if (idx === nextStageIndex) {
            return {
              ...stage,
              opportunities: stage.opportunities.filter((item) => item.id !== opportunityId),
            };
          }
          if (idx === currentStageIndex) {
            return {
              ...stage,
              opportunities: [{ ...opportunity }, ...stage.opportunities],
            };
          }
          return stage;
        }),
      );
      toast.error(error instanceof Error ? error.message : 'Failed to move opportunity');
    } finally {
      setMovingId(null);
      setDraggingOpportunityId(null);
    }
  }

  async function moveOpportunity(opportunityId: string, direction: 'left' | 'right') {
    const currentStageIndex = findStageIndexByOpportunity(opportunityId);
    if (currentStageIndex < 0) return;
    const nextStageIndex = direction === 'left' ? currentStageIndex - 1 : currentStageIndex + 1;
    if (nextStageIndex < 0 || nextStageIndex >= stages.length) return;
    await moveOpportunityToStage(opportunityId, stages[nextStageIndex].id);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pipelines & Opportunities</h1>
          <p className="text-sm text-slate-500">Move opportunities across stages with optimistic updates.</p>
        </div>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} className="w-[300px]" placeholder="Search opportunities" />
      </header>

      <div className="grid gap-4 lg:grid-cols-4">
        {filteredStages.map((stage, stageIndex) => (
          <Card
            key={stage.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const droppedId = event.dataTransfer.getData('text/plain') || draggingOpportunityId;
              if (!droppedId) return;
              void moveOpportunityToStage(droppedId, stage.id);
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{stage.name}</span>
                <Badge variant="secondary">{stage.opportunities.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stage.opportunities.map((opportunity) => (
                <div
                  key={opportunity.id}
                  className="rounded-lg border p-3"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', opportunity.id);
                    setDraggingOpportunityId(opportunity.id);
                  }}
                  onDragEnd={() => setDraggingOpportunityId(null)}
                >
                  <p className="text-sm font-semibold">{opportunity.name}</p>
                  <p className="text-xs text-slate-500">{opportunity.account.name}</p>
                  <p className="text-sm font-medium">{currency(Number(opportunity.value))}</p>
                  <div className="mt-2 flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => moveOpportunity(opportunity.id, 'left')}
                      disabled={stageIndex === 0 || movingId === opportunity.id}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => moveOpportunity(opportunity.id, 'right')}
                      disabled={stageIndex === filteredStages.length - 1 || movingId === opportunity.id}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {stage.opportunities.length === 0 ? <p className="text-xs text-slate-500">No opportunities in this stage.</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
