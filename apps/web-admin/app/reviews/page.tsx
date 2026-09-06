import { AdminShell } from '../../src/admin-shell';
import { ReviewsModerationList } from '../../src/reviews-list';

export default function ReviewsPage() {
  return (
    <AdminShell currentNav="reviews">
      <ReviewsModerationList />
    </AdminShell>
  );
}
