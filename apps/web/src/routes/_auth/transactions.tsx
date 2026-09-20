import { Badge } from "@steelhacks-2026/ui/components/badge";
import { Button } from "@steelhacks-2026/ui/components/button";
import { Card, CardContent } from "@steelhacks-2026/ui/components/card";
import { Input } from "@steelhacks-2026/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@steelhacks-2026/ui/components/select";
import { Skeleton } from "@steelhacks-2026/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@steelhacks-2026/ui/components/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";

import { useActiveMember } from "@/hooks/use-active-member";
import { categoryMeta, KNOWN_CATEGORIES } from "@/lib/categories";
import { formatCents, formatIsoDate, formatSignedCents } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/transactions")({
  component: RouteComponent,
});

const PAGE_SIZE = 25;
const ALL_VALUE = "all";

function RouteComponent() {
  const { activeMemberId, isLoading: membersLoading } = useActiveMember();
  const enabled = !!activeMemberId;

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL_VALUE);
  const [bankAccountId, setBankAccountId] = useState<string>(ALL_VALUE);
  const [offset, setOffset] = useState(0);

  const accounts = useQuery(
    orpc.caretaker.transactions.accounts.queryOptions({
      input: { memberId: activeMemberId! },
      enabled,
    }),
  );

  const list = useQuery(
    orpc.caretaker.transactions.list.queryOptions({
      input: {
        memberId: activeMemberId!,
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        category: category === ALL_VALUE ? undefined : category,
        bankAccountId: bankAccountId === ALL_VALUE ? undefined : bankAccountId,
      },
      enabled,
      placeholderData: keepPreviousData,
    }),
  );

  if (membersLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!enabled) {
    return <div className="text-muted-foreground text-sm">No members linked yet.</div>;
  }

  function resetAndSet<T>(setter: (v: T) => void) {
    return (v: T) => {
      setOffset(0);
      setter(v);
    };
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Transactions" value={list.data ? String(list.data.totals.count) : undefined} />
        <Stat
          label="Total expenses"
          value={list.data ? formatCents(list.data.totals.expenseCents) : undefined}
        />
        <Stat
          label="Total income"
          value={list.data ? formatCents(list.data.totals.incomeCents) : undefined}
          className="text-green-500"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search merchant"
            className="pl-8"
            value={search}
            onChange={(e) => resetAndSet(setSearch)(e.target.value)}
          />
        </div>
        <Select
          value={category}
          onValueChange={(value) => resetAndSet(setCategory)(value ?? ALL_VALUE)}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All categories</SelectItem>
            {KNOWN_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryMeta(c).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={bankAccountId}
          onValueChange={(value) => resetAndSet(setBankAccountId)(value ?? ALL_VALUE)}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All accounts</SelectItem>
            {accounts.data?.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} {a.mask ? `••${a.mask}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                  <TableHead className="hidden md:table-cell">Account</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-center">
                      No transactions match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {list.data?.items.map((t) => {
                  const meta = categoryMeta(t.category);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {t.merchantName ?? "Unknown"}
                        {t.pending && (
                          <Badge variant="secondary" className="ml-2">
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="gap-1">
                          <meta.icon className="size-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {t.accountName ? `${t.accountName} ••${t.accountMask ?? ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatIsoDate(t.date)}
                      </TableCell>
                      <TableCell
                        className={
                          "text-right font-medium" + (t.amountCents < 0 ? " text-green-500" : "")
                        }
                      >
                        {formatSignedCents(t.amountCents)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={list.data?.nextOffset == null}
          onClick={() => setOffset(list.data?.nextOffset ?? offset)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | undefined;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-1 h-6 w-16" />
        ) : (
          <p className={"text-lg font-semibold " + (className ?? "")}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
