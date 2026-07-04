/**
 * ChildOrderEditor — reusable ordering UI for any union's child group.
 *
 * Renders an ordered list of children with up/down buttons.
 * Only shown when there are >= 2 children.
 *
 * Props:
 *   unionId   - the union ID (e.g. 'U_PARENTS', 'U_MAT_UNCLE_0') — accepted
 *               for caller-side identification (e.g. React keys); not read
 *               by this component directly.
 *   items     - array of { token: string, label: string }
 *               in their current effective order
 *   getOrder  - () => string[] | undefined — reads current childOrders[unionId]
 *   setOrder  - (newOrder: string[]) => void — writes childOrders[unionId]
 *   label     - optional heading text
 */
export default function ChildOrderEditor({ items, getOrder, setOrder, label }) {
  if (!items || items.length < 2) return null;

  // Determine effective order: manual or natural item order
  const currentOrder = getOrder();
  let orderedItems;
  if (Array.isArray(currentOrder) && currentOrder.length > 0) {
    // Sort items by their position in currentOrder; unrecognized tokens go to end
    const orderIndex = new Map();
    currentOrder.forEach((token, i) => orderIndex.set(token, i));
    orderedItems = [...items].sort((a, b) => {
      const ia = orderIndex.has(a.token) ? orderIndex.get(a.token) : Infinity;
      const ib = orderIndex.has(b.token) ? orderIndex.get(b.token) : Infinity;
      return ia - ib;
    });
  } else {
    orderedItems = [...items];
  }

  const moveUp = (index) => {
    if (index <= 0) return;
    const tokens = orderedItems.map(it => it.token);
    [tokens[index - 1], tokens[index]] = [tokens[index], tokens[index - 1]];
    setOrder(tokens);
  };

  const moveDown = (index) => {
    if (index >= orderedItems.length - 1) return;
    const tokens = orderedItems.map(it => it.token);
    [tokens[index], tokens[index + 1]] = [tokens[index + 1], tokens[index]];
    setOrder(tokens);
  };

  return (
    <div style={{
      marginTop: '6px',
      padding: '6px',
      background: '#f1f5f9',
      borderRadius: '4px',
      border: '1px solid #e2e8f0',
    }}>
      {label && (
        <div style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#475569',
          marginBottom: '4px',
        }}>
          {label}
        </div>
      )}
      {orderedItems.map((item, idx) => (
        <div
          key={item.token}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 4px',
            marginBottom: idx < orderedItems.length - 1 ? '2px' : 0,
            background: '#fff',
            borderRadius: '3px',
            border: '1px solid #e2e8f0',
            fontSize: '0.72rem',
          }}
        >
          <span style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#334155',
          }}>
            {item.label}
          </span>
          <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
            <button
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              aria-label={`${item.label} yukari tasi`}
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #cbd5e1',
                borderRadius: '2px',
                background: idx === 0 ? '#f1f5f9' : '#fff',
                color: idx === 0 ? '#94a3b8' : '#334155',
                cursor: idx === 0 ? 'default' : 'pointer',
                fontSize: '0.7rem',
                padding: 0,
              }}
            >
              {'▲'}
            </button>
            <button
              onClick={() => moveDown(idx)}
              disabled={idx === orderedItems.length - 1}
              aria-label={`${item.label} asagi tasi`}
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #cbd5e1',
                borderRadius: '2px',
                background: idx === orderedItems.length - 1 ? '#f1f5f9' : '#fff',
                color: idx === orderedItems.length - 1 ? '#94a3b8' : '#334155',
                cursor: idx === orderedItems.length - 1 ? 'default' : 'pointer',
                fontSize: '0.7rem',
                padding: 0,
              }}
            >
              {'▼'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
