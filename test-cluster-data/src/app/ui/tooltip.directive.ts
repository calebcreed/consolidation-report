
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
