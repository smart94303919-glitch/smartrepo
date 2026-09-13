import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CictfirstPage } from './cictfirst.page';

const routes: Routes = [
  {
    path: '',
    component: CictfirstPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CictfirstPageRoutingModule {}
