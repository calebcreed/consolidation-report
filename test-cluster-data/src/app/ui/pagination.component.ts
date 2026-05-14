
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-pagination',
  template: `
    <div class="pagination">
      <button [disabled]="page === 1" (click)="changePage(page - 1)">Prev</button>
      <span *ngFor="let p of pages" [class.active]="p === page" (click)="changePage(p)">{{p}}</span>
      <button [disabled]="page === totalPages" (click)="changePage(page + 1)">Next</button>
    </div>
  `
})
export class PaginationComponent {
  @Input() page = 1;
  @Input() totalPages = 1;
  @Output() pageChange = new EventEmitter<number>();
  get pages() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }
  changePage(p: number) { this.page = p; this.pageChange.emit(p); }
}
