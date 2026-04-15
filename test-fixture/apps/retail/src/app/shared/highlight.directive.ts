import { Directive, ElementRef } from '@angular/core';

// A9: Directive - used in templates as *appHighlight or [appHighlight]
@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  constructor(private el: ElementRef) {
    this.el.nativeElement.style.backgroundColor = 'yellow';
  }
}
