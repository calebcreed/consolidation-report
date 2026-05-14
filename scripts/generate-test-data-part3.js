/**
 * Part 3: UI, Utils, API, State, Isolated clusters
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '../test-cluster-data/src/app');

function write(filePath, content) {
  const dir = path.dirname(path.join(BASE, filePath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(BASE, filePath), content);
  console.log(`Created: ${filePath}`);
}

// ============ CLUSTER 6: UI COMPONENTS (10 files) ============

write('ui/button.component.ts', `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-button',
  template: \`
    <button [type]="type" [class]="variant" [disabled]="disabled" (click)="onClick.emit($event)">
      <ng-content></ng-content>
    </button>
  \`
})
export class ButtonComponent {
  @Input() type: 'button' | 'submit' = 'button';
  @Input() variant: 'primary' | 'secondary' | 'danger' = 'primary';
  @Input() disabled = false;
  @Output() onClick = new EventEmitter<MouseEvent>();
}
`);

write('ui/input.component.ts', `
import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input',
  template: \`
    <div class="input-wrapper">
      <label *ngIf="label">{{label}}</label>
      <input [type]="type" [placeholder]="placeholder" [(ngModel)]="value" (blur)="onBlur()">
      <span class="error" *ngIf="error">{{error}}</span>
    </div>
  \`,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => InputComponent), multi: true }]
})
export class InputComponent implements ControlValueAccessor {
  @Input() type = 'text';
  @Input() label = '';
  @Input() placeholder = '';
  @Input() error = '';
  value = '';
  onChange = (v: string) => {};
  onTouched = () => {};
  writeValue(v: string) { this.value = v; }
  registerOnChange(fn: any) { this.onChange = fn; }
  registerOnTouched(fn: any) { this.onTouched = fn; }
  onBlur() { this.onTouched(); }
}
`);

write('ui/modal.component.ts', `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-modal',
  template: \`
    <div class="modal-backdrop" *ngIf="isOpen" (click)="close()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>{{title}}</h3>
          <button class="close" (click)="close()">&times;</button>
        </div>
        <div class="modal-body"><ng-content></ng-content></div>
        <div class="modal-footer"><ng-content select="[footer]"></ng-content></div>
      </div>
    </div>
  \`
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();
  close() { this.closed.emit(); }
}
`);

write('ui/dropdown.component.ts', `
import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface DropdownOption { value: string; label: string; }

@Component({
  selector: 'app-dropdown',
  template: \`
    <div class="dropdown" [class.open]="isOpen">
      <button (click)="toggle()">{{selectedLabel || placeholder}}</button>
      <ul *ngIf="isOpen">
        <li *ngFor="let opt of options" (click)="select(opt)">{{opt.label}}</li>
      </ul>
    </div>
  \`
})
export class DropdownComponent {
  @Input() options: DropdownOption[] = [];
  @Input() placeholder = 'Select...';
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  isOpen = false;
  get selectedLabel() { return this.options.find(o => o.value === this.value)?.label; }
  toggle() { this.isOpen = !this.isOpen; }
  select(opt: DropdownOption) { this.value = opt.value; this.valueChange.emit(opt.value); this.isOpen = false; }
}
`);

write('ui/table.component.ts', `
import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface TableColumn { key: string; label: string; sortable?: boolean; }

@Component({
  selector: 'app-table',
  template: \`
    <table>
      <thead>
        <tr>
          <th *ngFor="let col of columns" (click)="col.sortable && sort(col.key)">
            {{col.label}} <span *ngIf="sortKey === col.key">{{sortDir === 'asc' ? '▲' : '▼'}}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let row of data" (click)="rowClick.emit(row)">
          <td *ngFor="let col of columns">{{row[col.key]}}</td>
        </tr>
      </tbody>
    </table>
  \`
})
export class TableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChange = new EventEmitter<{key: string, dir: string}>();
  sortKey = '';
  sortDir = 'asc';
  sort(key: string) {
    this.sortDir = this.sortKey === key && this.sortDir === 'asc' ? 'desc' : 'asc';
    this.sortKey = key;
    this.sortChange.emit({ key, dir: this.sortDir });
  }
}
`);

write('ui/pagination.component.ts', `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-pagination',
  template: \`
    <div class="pagination">
      <button [disabled]="page === 1" (click)="changePage(page - 1)">Prev</button>
      <span *ngFor="let p of pages" [class.active]="p === page" (click)="changePage(p)">{{p}}</span>
      <button [disabled]="page === totalPages" (click)="changePage(page + 1)">Next</button>
    </div>
  \`
})
export class PaginationComponent {
  @Input() page = 1;
  @Input() totalPages = 1;
  @Output() pageChange = new EventEmitter<number>();
  get pages() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }
  changePage(p: number) { this.page = p; this.pageChange.emit(p); }
}
`);

write('ui/tooltip.directive.ts', `
import { Directive, Input, ElementRef, HostListener } from '@angular/core';

@Directive({ selector: '[appTooltip]' })
export class TooltipDirective {
  @Input('appTooltip') text = '';
  private tooltip: HTMLElement | null = null;

  constructor(private el: ElementRef) {}

  @HostListener('mouseenter') show() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.textContent = this.text;
    document.body.appendChild(this.tooltip);
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.tooltip.style.top = rect.top - 30 + 'px';
    this.tooltip.style.left = rect.left + 'px';
  }

  @HostListener('mouseleave') hide() {
    if (this.tooltip) { this.tooltip.remove(); this.tooltip = null; }
  }
}
`);

write('ui/loading.component.ts', `
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading',
  template: \`
    <div class="loading" *ngIf="isLoading">
      <div class="spinner" [class]="size"></div>
      <span *ngIf="message">{{message}}</span>
    </div>
  \`
})
export class LoadingComponent {
  @Input() isLoading = false;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() message = '';
}
`);

write('ui/alert.component.ts', `
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-alert',
  template: \`
    <div class="alert" [class]="type" *ngIf="visible">
      <span>{{message}}</span>
      <button *ngIf="dismissible" (click)="dismiss()">&times;</button>
    </div>
  \`
})
export class AlertComponent {
  @Input() type: 'success' | 'error' | 'warning' | 'info' = 'info';
  @Input() message = '';
  @Input() dismissible = true;
  @Output() dismissed = new EventEmitter<void>();
  visible = true;
  dismiss() { this.visible = false; this.dismissed.emit(); }
}
`);

write('ui/ui.module.ts', `
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from './button.component';
import { InputComponent } from './input.component';
import { ModalComponent } from './modal.component';
import { DropdownComponent } from './dropdown.component';
import { TableComponent } from './table.component';
import { PaginationComponent } from './pagination.component';
import { TooltipDirective } from './tooltip.directive';
import { LoadingComponent } from './loading.component';
import { AlertComponent } from './alert.component';

@NgModule({
  imports: [CommonModule, FormsModule],
  declarations: [ButtonComponent, InputComponent, ModalComponent, DropdownComponent, TableComponent, PaginationComponent, TooltipDirective, LoadingComponent, AlertComponent],
  exports: [ButtonComponent, InputComponent, ModalComponent, DropdownComponent, TableComponent, PaginationComponent, TooltipDirective, LoadingComponent, AlertComponent]
})
export class UiModule {}
`);

// ============ CLUSTER 7: UTILS (10 files) ============

write('utils/date.utils.ts', `
import { formatDistance, format, parseISO } from './date-helpers';

export function formatDate(date: Date | string, pattern = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern);
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistance(d, new Date(), { addSuffix: true });
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
`);

write('utils/date-helpers.ts', `
export function parseISO(dateStr: string): Date {
  return new Date(dateStr);
}

export function format(date: Date, pattern: string): string {
  const map: Record<string, string> = {
    'yyyy': date.getFullYear().toString(),
    'MM': (date.getMonth() + 1).toString().padStart(2, '0'),
    'dd': date.getDate().toString().padStart(2, '0'),
    'HH': date.getHours().toString().padStart(2, '0'),
    'mm': date.getMinutes().toString().padStart(2, '0'),
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm/g, m => map[m]);
}

export function formatDistance(date: Date, base: Date, opts?: { addSuffix?: boolean }): string {
  const diff = Math.abs(base.getTime() - date.getTime());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const suffix = opts?.addSuffix ? (date < base ? ' ago' : ' from now') : '';
  if (days === 0) return 'today';
  if (days === 1) return '1 day' + suffix;
  return days + ' days' + suffix;
}
`);

write('utils/string.utils.ts', `
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
`);

write('utils/number.utils.ts', `
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatPercent(value: number, decimals = 0): string {
  return (value * 100).toFixed(decimals) + '%';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
`);

write('utils/array.utils.ts', `
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function sortBy<T>(arr: T[], key: keyof T, dir: 'asc' | 'desc' = 'asc'): T[] {
  return [...arr].sort((a, b) => {
    const mult = dir === 'asc' ? 1 : -1;
    return a[key] > b[key] ? mult : -mult;
  });
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
`);

write('utils/validation.utils.ts', `
export function isEmail(value: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
}

export function isPhone(value: string): boolean {
  return /^\\+?[\\d\\s-]{10,}$/.test(value);
}

export function isUrl(value: string): boolean {
  try { new URL(value); return true; } catch { return false; }
}

export function minLength(value: string, min: number): boolean {
  return value.length >= min;
}

export function maxLength(value: string, max: number): boolean {
  return value.length <= max;
}

export function required(value: any): boolean {
  return value !== null && value !== undefined && value !== '';
}
`);

write('utils/storage.utils.ts', `
export function getItem<T>(key: string): T | null {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : null;
}

export function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeItem(key: string): void {
  localStorage.removeItem(key);
}

export function clear(): void {
  localStorage.clear();
}

export function getSessionItem<T>(key: string): T | null {
  const item = sessionStorage.getItem(key);
  return item ? JSON.parse(item) : null;
}

export function setSessionItem<T>(key: string, value: T): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}
`);

write('utils/http.utils.ts', `
export function buildQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => \`\${encodeURIComponent(k)}=\${encodeURIComponent(v)}\`)
    .join('&');
}

export function parseQueryString(qs: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(qs));
}

export function joinUrl(...parts: string[]): string {
  return parts.map(p => p.replace(/^\\/|\\/$/g, '')).join('/');
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}
`);

write('utils/object.utils.ts', `
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return keys.reduce((acc, key) => { acc[key] = obj[key]; return acc; }, {} as Pick<T, K>);
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(k => delete (result as any)[k]);
  return result;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function isEmpty(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

export function merge<T extends object>(target: T, ...sources: Partial<T>[]): T {
  return Object.assign({}, target, ...sources);
}
`);

write('utils/index.ts', `
export * from './date.utils';
export * from './date-helpers';
export * from './string.utils';
export * from './number.utils';
export * from './array.utils';
export * from './validation.utils';
export * from './storage.utils';
export * from './http.utils';
export * from './object.utils';
`);

// ============ CLUSTER 8: ISOLATED FILES (10 files - NO dependencies) ============

write('isolated/standalone-helper.ts', `
// This file has NO imports - completely standalone
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeout: any;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  }) as T;
}
`);

write('isolated/constants.ts', `
// Pure constants - no dependencies
export const APP_NAME = 'MyApp';
export const VERSION = '1.0.0';
export const API_TIMEOUT = 30000;
export const MAX_RETRIES = 3;
export const DEFAULT_PAGE_SIZE = 20;
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de'];
export const THEME_OPTIONS = ['light', 'dark', 'system'];
`);

write('isolated/types.ts', `
// Pure type definitions - no runtime dependencies
export type ID = string | number;
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export interface Dictionary<T> { [key: string]: T; }
export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]>; };
export type ValueOf<T> = T[keyof T];
`);

write('isolated/regex-patterns.ts', `
// Standalone regex patterns - no dependencies
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
export const PHONE_PATTERN = /^\\+?[1-9]\\d{1,14}$/;
export const URL_PATTERN = /^https?:\\/\\/[^\\s]+$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
`);

write('isolated/error-codes.ts', `
// Error code constants - no dependencies
export enum ErrorCode {
  UNKNOWN = 'E000',
  NETWORK_ERROR = 'E001',
  TIMEOUT = 'E002',
  UNAUTHORIZED = 'E401',
  FORBIDDEN = 'E403',
  NOT_FOUND = 'E404',
  VALIDATION_ERROR = 'E422',
  SERVER_ERROR = 'E500',
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN]: 'An unknown error occurred',
  [ErrorCode.NETWORK_ERROR]: 'Network connection failed',
  [ErrorCode.TIMEOUT]: 'Request timed out',
  [ErrorCode.UNAUTHORIZED]: 'Authentication required',
  [ErrorCode.FORBIDDEN]: 'Access denied',
  [ErrorCode.NOT_FOUND]: 'Resource not found',
  [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
  [ErrorCode.SERVER_ERROR]: 'Server error',
};
`);

write('isolated/math-helpers.ts', `
// Standalone math functions - no dependencies
export function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) return false;
  }
  return true;
}

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
`);

write('isolated/color-utils.ts', `
// Standalone color utilities - no dependencies
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function lighten(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 + percent / 100;
  return rgbToHex(
    Math.min(255, Math.round(rgb.r * factor)),
    Math.min(255, Math.round(rgb.g * factor)),
    Math.min(255, Math.round(rgb.b * factor))
  );
}
`);

write('isolated/crypto-utils.ts', `
// Standalone crypto utilities - no dependencies (uses native APIs)
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

export function base64Encode(str: string): string {
  return btoa(encodeURIComponent(str));
}

export function base64Decode(str: string): string {
  return decodeURIComponent(atob(str));
}

export function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
`);

write('isolated/env-config.ts', `
// Environment configuration - no dependencies
export const ENV = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  appTitle: 'Development App',
  logLevel: 'debug',
  features: {
    darkMode: true,
    analytics: false,
    betaFeatures: true,
  }
};
`);

write('isolated/animations.ts', `
// Standalone animation definitions - no dependencies
export const fadeIn = {
  from: { opacity: 0 },
  to: { opacity: 1 },
  duration: 300,
};

export const slideUp = {
  from: { transform: 'translateY(20px)', opacity: 0 },
  to: { transform: 'translateY(0)', opacity: 1 },
  duration: 400,
};

export const scaleIn = {
  from: { transform: 'scale(0.9)', opacity: 0 },
  to: { transform: 'scale(1)', opacity: 1 },
  duration: 250,
};

export const EASING = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};
`);

console.log('\n✓ Created UI cluster (10 files)');
console.log('✓ Created Utils cluster (10 files)');
console.log('✓ Created Isolated files (10 files - NO dependencies, should be unassigned)');
console.log('\nTotal: 100 files created');
console.log('\n=== EXPECTED CLUSTERING RESULTS ===');
console.log('Cluster 1 (Auth): 10 files - all heavily interconnected');
console.log('Cluster 2 (User): 10 files - all heavily interconnected');
console.log('Cluster 3 (Product): 10 files - all heavily interconnected');
console.log('Cluster 4 (Cart): 10 files - all heavily interconnected');
console.log('Cluster 5 (Order): 10 files - all heavily interconnected');
console.log('Cluster 6 (UI): 10 files - moderate interconnection via module');
console.log('Cluster 7 (Utils): 10 files - moderate interconnection via index');
console.log('Unassigned: 10 isolated files - NO dependencies');
