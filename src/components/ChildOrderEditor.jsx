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

  const move = (index, delta) => {
    const j = index + delta;
    if (j < 0 || j >= orderedItems.length) return;
    const tokens = orderedItems.map(it => it.token);
    [tokens[index], tokens[j]] = [tokens[j], tokens[index]];
    setOrder(tokens);
  };

  return (
    <div className="order-list">
      {label && <div className="order-title">{label} <span className="muted">(soldan sağa)</span></div>}
      {orderedItems.map((item, idx) => (
        <div key={item.token} className="order-item">
          <span>{idx + 1}. {item.label}</span>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`${item.label} yukarı taşı`}>▲</button>
            <button onClick={() => move(idx, 1)} disabled={idx === orderedItems.length - 1} aria-label={`${item.label} aşağı taşı`}>▼</button>
          </div>
        </div>
      ))}
    </div>
  );
}
