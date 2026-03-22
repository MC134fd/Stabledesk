import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function NotFound() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl font-bold font-mono gradient-text mb-4">404</p>
        <h1 className="text-xl font-semibold text-text-primary mb-2">Page not found</h1>
        <p className="text-sm text-text-muted mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/app">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
