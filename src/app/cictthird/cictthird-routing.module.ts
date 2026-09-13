import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CictthirdPage } from './cictthird.page';

const routes: Routes = [
  {
    path: '',
    component: CictthirdPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CictthirdPageRoutingModule {}
