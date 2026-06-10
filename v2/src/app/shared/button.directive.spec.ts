import { ElementRef } from '@angular/core';
import { ButtonDirective } from './button.directive';

describe('ButtonDirective', () => {
  it('should create an instance', () => {
    const directive = new ButtonDirective(new ElementRef(document.createElement('button')));
    expect(directive).toBeTruthy();
  });
});
