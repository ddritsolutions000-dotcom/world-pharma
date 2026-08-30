import { Text } from './text';

export function Table({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="wp-table-wrap">
      <table className="wp-table">
        <caption className="wp-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.join('-') + i}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="wp-list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function KeyValue({ items }: { items: Array<{ key: string; value: string }> }) {
  return (
    <dl className="wp-kv">
      {items.map((item) => (
        <div key={item.key} style={{ display: 'contents' }}>
          <dt>
            <Text size="bodySm" tone="secondary">
              {item.key}
            </Text>
          </dt>
          <dd>
            <Text size="bodySm" tabular>
              {item.value}
            </Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="wp-stat">
      <span className="wp-text-caption">{label}</span>
      <span className="wp-stat-value">{value}</span>
    </div>
  );
}
