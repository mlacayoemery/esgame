import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LevelComponent } from './level/level.component';
import { GameBoardComponent } from './game-board/game-board.component';
import { FieldComponent } from './field/field.component';
import { ProductionTypeButtonComponent } from './product-type-button/production-type-button.component';
import { PointBoardComponent } from './point-board/point-board.component';
import { Layout2Component } from './layout/layout2/layout2.component';
import { Layout1Component } from './layout/layout1/layout1.component';
import { NavigationComponent } from './layout/navigation/navigation.component';
import { ScoreBoardComponent } from './score-board/score-board.component';
import { BoardLegendComponent } from './board-legend/board-legend.component';
import { ButtonDirective } from './shared/button.directive';

@NgModule({
  declarations: [
    AppComponent,
    LevelComponent,
    GameBoardComponent,
    FieldComponent,
    ProductionTypeButtonComponent,
    PointBoardComponent,
    Layout2Component,
    Layout1Component,
    NavigationComponent,
    ScoreBoardComponent,
    BoardLegendComponent,
    ButtonDirective,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
