import { config } from '../config/index.js';
import { generateUuid } from '../utils/crypto.js';
import {
  PlaybackActionPayload,
  PlaybackActionType,
  PlaybackRequest,
  RequestStatus,
} from '../types/index.js';

export class RequestManager {
  // roomId -> Map<requestId, PlaybackRequest>
  private requestsByRoom: Map<string, Map<string, PlaybackRequest>> = new Map();

  /**
   * Submit a new playback request from a Participant
   */
  public createRequest(
    roomId: string,
    requesterId: string,
    requesterName: string,
    action: PlaybackActionType,
    payload: PlaybackActionPayload
  ): PlaybackRequest {
    if (!this.requestsByRoom.has(roomId)) {
      this.requestsByRoom.set(roomId, new Map());
    }

    const roomRequests = this.requestsByRoom.get(roomId)!;

    // Check pending count limit to prevent spam
    const pendingCount = Array.from(roomRequests.values()).filter(r => r.status === 'PENDING').length;
    if (pendingCount >= config.maxPendingRequestsPerRoom) {
      throw new Error('TOO_MANY_PENDING_REQUESTS');
    }

    const request: PlaybackRequest = {
      id: generateUuid(),
      roomId,
      requesterId,
      requesterName,
      action,
      payload,
      timestamp: Date.now(),
      status: 'PENDING',
    };

    roomRequests.set(request.id, request);
    return request;
  }

  /**
   * Get all active requests for a room
   */
  public getRoomRequests(roomId: string): PlaybackRequest[] {
    const roomRequests = this.requestsByRoom.get(roomId);
    if (!roomRequests) return [];
    return Array.from(roomRequests.values());
  }

  /**
   * Host approves or rejects a playback request.
   * Enforces idempotency and prevents replay attacks.
   */
  public reviewRequest(
    roomId: string,
    requestId: string,
    reviewerId: string,
    approve: boolean
  ): PlaybackRequest {
    const roomRequests = this.requestsByRoom.get(roomId);
    if (!roomRequests) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    const request = roomRequests.get(requestId);
    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    if (request.status !== 'PENDING') {
      throw new Error('REQUEST_ALREADY_PROCESSED');
    }

    request.status = approve ? 'APPROVED' : 'REJECTED';
    request.reviewedBy = reviewerId;
    request.reviewedAt = Date.now();

    return request;
  }

  /**
   * Invalidate requests when requester leaves
   */
  public invalidateUserRequests(roomId: string, requesterId: string): PlaybackRequest[] {
    const roomRequests = this.requestsByRoom.get(roomId);
    if (!roomRequests) return [];

    const expired: PlaybackRequest[] = [];
    for (const request of roomRequests.values()) {
      if (request.requesterId === requesterId && request.status === 'PENDING') {
        request.status = 'EXPIRED';
        expired.push(request);
      }
    }
    return expired;
  }

  /**
   * Cleanup room
   */
  public clearRoom(roomId: string): void {
    this.requestsByRoom.delete(roomId);
  }
}

export const requestManager = new RequestManager();
