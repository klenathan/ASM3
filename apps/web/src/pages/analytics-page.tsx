import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Box, DatabaseZap, LoaderCircle, Play } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageHeading } from '@/components/page-heading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'

export function AnalyticsPage() {
  const queryClient = useQueryClient()
  const [queryId, setQueryId] = useState<string | null>(null)
  const startQuery = useMutation({
    mutationFn: api.startQuery,
    onSuccess: (query) => setQueryId(query.query_execution_id),
    onError: (error) => toast.error(error.message),
  })
  const query = useQuery({
    queryKey: ['athena-query', queryId],
    queryFn: () => api.queryResult(queryId!),
    enabled: Boolean(queryId),
    refetchInterval: ({ state }) => ['QUEUED', 'RUNNING'].includes(state.data?.status ?? '') ? 2500 : false,
  })
  const runWorker = useMutation({
    mutationFn: api.runAnalytics,
    onSuccess: (task) => {
      toast.success(`ECS task started: ${task.status}`)
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (error) => toast.error(error.message),
  })
  const reports = useQuery({ queryKey: ['reports'], queryFn: api.reports })

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Distributed analysis"
        title="Turn observations into evidence."
        description="Athena runs interactive SQL over S3. ECS Fargate executes containerized batch aggregation and returns durable report artifacts."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-400"><DatabaseZap className="size-5" /></span>
            <CardTitle>Athena seven-day summary</CardTitle>
            <CardDescription>Starts a controlled serverless SQL query over S3 raw observations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => startQuery.mutate()} disabled={startQuery.isPending || query.isFetching}>
              {(startQuery.isPending || query.isFetching) ? <LoaderCircle className="animate-spin" /> : <Play />} Run Athena query
            </Button>
            {query.data && <Badge variant="outline" className="ml-2">{query.data.status}</Badge>}
            {query.data?.reason && <p className="mt-3 text-sm text-destructive">{query.data.reason}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400"><Box className="size-5" /></span>
            <CardTitle>ECS batch report</CardTitle>
            <CardDescription>Launches an on-demand Fargate task from the API—no console or CLI step.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => runWorker.mutate()} disabled={runWorker.isPending}>
              {runWorker.isPending ? <LoaderCircle className="animate-spin" /> : <Play />} Start container task
            </Button>
          </CardContent>
        </Card>
      </section>

      {query.data?.status === 'SUCCEEDED' && (
        <Card>
          <CardHeader><CardTitle>Athena result</CardTitle><CardDescription>Aggregated measurements from past seven days.</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>{query.data.columns.map((column) => <TableHead key={column}>{column.replaceAll('_', ' ')}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{query.data.rows.map((row, index) => <TableRow key={index}>{query.data.columns.map((column) => <TableCell key={column}>{row[column] ?? '—'}</TableCell>)}</TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="size-4" /> Generated reports</CardTitle><CardDescription>S3 report artifacts produced by ECS analytics tasks.</CardDescription></CardHeader>
        <CardContent>
          {reports.data?.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Object key</TableHead><TableHead>Size</TableHead><TableHead>Generated</TableHead></TableRow></TableHeader>
              <TableBody>{reports.data.map((report) => <TableRow key={report.key}><TableCell className="font-mono text-xs">{report.key}</TableCell><TableCell>{report.size.toLocaleString()} B</TableCell><TableCell>{new Date(report.last_modified).toLocaleString()}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : <p className="py-8 text-center text-sm text-muted-foreground">No batch reports yet.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
