import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';

/**
 * Registers/unregisters a socket.io event listener for the lifetime of the component.
 * @param event  Socket event name (e.g. 'message:new')
 * @param handler Callback to run when the event fires
 * @param deps    Optional dependency array — if provided, handler is refreshed when deps change
 */
export function useSocketEvent(
  event: string,
  handler: (data: unknown) => void,
  deps: unknown[] = []
): void {
  // Keep a stable ref to the latest handler so we don't need to re-subscribe on every render
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handler, ...deps]);

  useEffect(() => {
    const socket = getSocket();
    const listener = (data: unknown) => handlerRef.current(data);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

export default useSocketEvent;
