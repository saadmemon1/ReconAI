import { describe, test, expect } from 'bun:test';
import { pettyCashPlan, PETTY_CASH_STEPS } from '../petty-cash-plan';

const statuses = (stage: number, failed = false) => pettyCashPlan('GPT-5.6 Luna', stage, failed)[0].subtasks.map(s => s.status);

describe('pettyCashPlan', () => {
  test('has one top-level task with the five pipeline steps', () => {
    const plan = pettyCashPlan('GPT-5.6 Luna', 0);
    expect(plan).toHaveLength(1);
    expect(plan[0].title).toBe('Petty-cash reconciliation');
    expect(plan[0].subtasks.slice(1).map(s => s.title)).toEqual(PETTY_CASH_STEPS.slice(1).map(s => s.title));
    expect(PETTY_CASH_STEPS).toHaveLength(5);
  });
  test('stage 0: the first step is in progress and its title names the cached model', () => {
    const plan = pettyCashPlan('GPT-5.6 Luna', 0);
    expect(statuses(0)).toEqual(['in-progress', 'pending', 'pending', 'pending', 'pending']);
    expect(plan[0].status).toBe('in-progress');
    expect(plan[0].subtasks[0].title).toBe('Reading the statement, receipts and ledger · GPT-5.6 Luna, cached');
    expect(plan[0].subtasks[0].description).toBe('Receipt reading: GPT-5.6 Luna, cached from the healer run');
  });
  test('stage 2: earlier steps are completed, the current one in progress', () => {
    expect(statuses(2)).toEqual(['completed', 'completed', 'in-progress', 'pending', 'pending']);
  });
  test('stage past the last step completes everything', () => {
    const plan = pettyCashPlan('GPT-5.6 Luna', 5);
    expect(statuses(5)).toEqual(['completed', 'completed', 'completed', 'completed', 'completed']);
    expect(plan[0].status).toBe('completed');
  });
  test('failed marks the current step as failed and leaves the rest', () => {
    expect(statuses(1, true)).toEqual(['completed', 'failed', 'pending', 'pending', 'pending']);
  });
  test('an empty model label still reads sensibly', () => {
    const first = pettyCashPlan('', 0)[0].subtasks[0];
    expect(first.title).toBe('Reading the statement, receipts and ledger');
    expect(first.description).toBe('Receipt reading: cached from the healer run');
  });
});
