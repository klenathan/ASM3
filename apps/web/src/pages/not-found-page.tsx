import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-semibold text-emerald-700">404</p>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">Requested CloudPulse route does not exist.</p>
      <Button asChild><Link to="/">Return to overview</Link></Button>
    </div>
  )
}
