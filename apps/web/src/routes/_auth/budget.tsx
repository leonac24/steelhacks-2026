import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@steelhacks-2026/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@steelhacks-2026/ui/components/dialog";
import { Input } from "@steelhacks-2026/ui/components/input";
import { Label } from "@steelhacks-2026/ui/components/label";
import { Progress } from "@steelhacks-2026/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@steelhacks-2026/ui/components/select";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { useActiveMember } from "@/hooks/use-active-member";
import { categoryMeta, KNOWN_CATEGORIES } from "@/lib/categories";
import { formatCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/budget")({
  component: RouteComponent,
});

function RouteComponent() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;
  const queryClient = useQueryClient();

  const budgets = useQuery(
    orpc.caretaker.budgets.list.queryOptions({ input: { memberId: activeMemberId! }, enabled }),
  );
  const breakdown = useQuery(
    orpc.caretaker.insights.categoryBreakdown.queryOptions({
      input: { memberId: activeMemberId!, days: 30 },
      enabled,
    }),
  );

  const upsert = useMutation(
    orpc.caretaker.budgets.upsert.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.caretaker.budgets.list.queryKey({ input: { memberId: activeMemberId! } }),
        });
      },
    }),
  );

  if (membersLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!enabled) {
    return <div className="text-muted-foreground text-sm">No members linked yet.</div>;
  }

  const spentByCategory = new Map((breakdown.data ?? []).map((c) => [c.category, c.totalCents]));
  const budgetedCategories = new Set((budgets.data ?? []).map((b) => b.category));
  const totalLimit = (budgets.data ?? []).reduce((sum, b) => sum + b.monthlyLimitCents, 0);
  const totalSpent = (budgets.data ?? []).reduce(
    (sum, b) => sum + (spentByCategory.get(b.category) ?? 0),
    0,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <BudgetDialog
          memberId={activeMemberId!}
          excludeCategories={budgetedCategories}
          onSave={(input) => upsert.mutate(input)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This month</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-semibold tracking-tight">{formatCents(totalSpent)}</p>
            <p className="text-muted-foreground text-sm">of {formatCents(totalLimit)} budgeted</p>
          </div>
          <p
            className={
              totalSpent > totalLimit ? "font-medium text-destructive" : "text-muted-foreground"
            }
          >
            {formatCents(Math.abs(totalLimit - totalSpent))}{" "}
            {totalSpent > totalLimit ? "over" : "remaining"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {budgets.isLoading && <Skeleton className="h-64 w-full" />}
          {!budgets.isLoading && budgets.data?.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No budgets yet. Add one to start tracking spend against a limit.
            </p>
          )}
          {budgets.data?.map((b) => {
            const meta = categoryMeta(b.category);
            const spent = spentByCategory.get(b.category) ?? 0;
            const over = spent > b.monthlyLimitCents;
            const pct = Math.min((spent / Math.max(b.monthlyLimitCents, 1)) * 100, 100);
            return (
              <div key={b.id} className="flex flex-col gap-1.5 py-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <meta.icon className="size-4 text-muted-foreground" />
                    {meta.label}
                  </span>
                  <span className={over ? "text-destructive" : "text-muted-foreground"}>
                    {formatCents(spent)} / {formatCents(b.monthlyLimitCents)}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={over ? "[&_[data-slot=progress-indicator]]:bg-destructive" : ""}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function BudgetDialog({
  memberId,
  excludeCategories,
  onSave,
}: {
  memberId: string;
  excludeCategories: Set<string>;
  onSave: (input: { memberId: string; category: string; monthlyLimitCents: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const options = KNOWN_CATEGORIES.filter((c) => !excludeCategories.has(c));

  function submit() {
    const dollars = Number(amount);
    if (!category || !Number.isFinite(dollars) || dollars <= 0) return;
    onSave({ memberId, category, monthlyLimitCents: Math.round(dollars * 100) });
    setOpen(false);
    setCategory("");
    setAmount("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Add budget
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a budget</DialogTitle>
          <DialogDescription>Set a monthly spending limit for a category.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-category">Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value ?? "")}>
              <SelectTrigger id="budget-category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {options.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryMeta(c).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-amount">Monthly limit</Label>
            <Input
              id="budget-amount"
              type="number"
              min="0"
              step="1"
              placeholder="300"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
