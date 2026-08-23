export default function LayoutLegales({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section
      className="contenedor pila"
      style={{
        paddingBlock: "3.5rem 5rem",
        maxWidth: "44rem",
        gap: "1.25rem",
        lineHeight: 1.75,
      }}
    >
      {children}
    </section>
  );
}
