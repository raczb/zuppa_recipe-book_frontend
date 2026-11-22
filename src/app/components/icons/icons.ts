import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-icons',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './icons.html',
  styleUrl: './icons.css'
})
export class IconsComponent {
  name = input<string>('');
  size = input<number>(24);
  color = input<string>('currentColor');
  isFilled = input<boolean>(false);
}
