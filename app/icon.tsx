import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171510"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            transform: "translateY(-1px)"
          }}
        >
          <span style={{ width: 30, height: 7, background: "#a85432" }} />
          <span style={{ width: 22, height: 7, background: "#d39b37" }} />
          <span style={{ width: 14, height: 7, background: "#596344" }} />
        </div>
      </div>
    ),
    size
  );
}
