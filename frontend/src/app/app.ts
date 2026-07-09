import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggle } from './shared/theme-toggle';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggle],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
