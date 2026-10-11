/*
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout. It is original work of the GGN project and
 * is made available under the terms of the MIT License.
 *
 * SPDX-License-Identifier: MIT
 * License text: LICENSE.
 */
/** Machine-readable validation and layout error codes. */
export enum LayoutErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_ID = 'MISSING_ID',
  DUPLICATE_ID = 'DUPLICATE_ID',
  NEGATIVE_SIZE = 'NEGATIVE_SIZE',
  NON_FINITE_SIZE = 'NON_FINITE_SIZE',
  EMPTY_ENDPOINTS = 'EMPTY_ENDPOINTS',
  DANGLING_ENDPOINT = 'DANGLING_ENDPOINT',
  MULTI_ENDPOINTS = 'MULTI_ENDPOINTS',
  UNSUPPORTED_ALGORITHM = 'UNSUPPORTED_ALGORITHM',
  CYCLIC_REFERENCE = 'CYCLIC_REFERENCE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  ABORTED = 'ABORTED',
}

/** A single actionable problem found while validating a layout input. */
export interface LayoutIssue {
  code: LayoutErrorCode
  path: string
  message: string
  retryable: boolean
}

export interface LayoutErrorOptions {
  phase?: string
  details?: unknown
  cause?: unknown
}

/**
 * Structured error for layout API failures.
 *
 * Validation failures are deterministic input errors and therefore always have
 * `retryable === false`; callers should fix the referenced path before retrying.
 */
export class LayoutError extends Error {
  readonly code: LayoutErrorCode
  readonly path: string
  readonly retryable: boolean
  readonly phase?: string
  readonly details?: unknown

  constructor(code: LayoutErrorCode, path: string, message: string, options: LayoutErrorOptions = {}) {
    const location = path || 'root'
    super(`${code} at ${location}: ${message}`, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'LayoutError'
    this.code = code
    this.path = path
    this.retryable = false
    this.phase = options.phase
    this.details = options.details
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON(): {
    name: string
    code: LayoutErrorCode
    path: string
    message: string
    retryable: boolean
    phase?: string
    details?: unknown
  } {
    const result: {
      name: string
      code: LayoutErrorCode
      path: string
      message: string
      retryable: boolean
      phase?: string
      details?: unknown
    } = {
      name: this.name,
      code: this.code,
      path: this.path,
      message: this.message,
      retryable: this.retryable,
    }
    if (this.phase !== undefined) result.phase = this.phase
    if (this.details !== undefined) result.details = this.details
    return result
  }
}
