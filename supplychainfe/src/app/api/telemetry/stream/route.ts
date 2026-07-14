import { telemetryEmitter } from '../../emitter';

export async function GET() {
  const encoder = new TextEncoder();

  const customStream = new ReadableStream({
    start(controller) {
      const onTelemetry = (data: any) => {
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error('SSE Stream error enqueuing telemetry:', err);
        }
      };

      telemetryEmitter.on('new-telemetry', onTelemetry);

      // Heartbeat to keep connection alive
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (err) {
          // Connection likely closed
        }
      }, 15000);

      // Return clean up handler
      return () => {
        telemetryEmitter.off('new-telemetry', onTelemetry);
        clearInterval(interval);
      };
    },
  });

  return new Response(customStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
