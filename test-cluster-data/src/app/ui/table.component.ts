
import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface TableColumn { key: string; label: string; sortable?: boolean; }

@Component({
  selector: 'app-table',
  template: `
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
  `
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
