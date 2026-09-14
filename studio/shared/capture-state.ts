/** Shared presentation of real capture state; never serialized as pattern code. */
export type CaptureView = {
  state: 'preparing' | 'recording' | 'finishing' | 'review' | 'saving' | 'failed';
  tabId: string;
  kind: 'phrase' | 'append' | 'new-pattern';
  label: string;
  trackId?: string;
  clipId?: string;
  start?: number;
  end?: number;
};
