import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LevelComponent } from './level/level.component';
import { GameBoardComponent } from './game-board/game-board.component';
import { FieldComponent } from './field/field.component';
import { ProductionTypeButtonComponent } from './product-type-button/production-type-button.component';

@NgModule({
  declarations: [
    AppComponent,
    LevelComponent,
    GameBoardComponent,
    FieldComponent,
    ProductionTypeButtonComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
