import { Component, ChangeDetectionStrategy, input, output, signal, inject, computed, OnInit, effect } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Ledger, Entry } from './app.component';

interface EntryWithBalance extends Entry {
  balance: number;
}

// Make TypeScript aware of the global variables from the CDN scripts
declare var XLSX: any;
declare var jsPDF: any;

@Component({
  selector: 'app-ledger-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="font-sans flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 animate-fade-in">
      <!-- Header -->
      <header class="flex items-center justify-between p-4 flex-shrink-0 border-b border-slate-200 dark:border-slate-800">
        @if (selectedEntries().length > 0) {
          <!-- Contextual Header for multi-select -->
          <div class="flex items-center space-x-4 animate-fade-in-fast w-full">
            <button (click)="clearSelection()" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Cancel selection">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
            </button>
            <span class="font-semibold">{{ selectedEntries().length }} selected</span>
            <div class="flex-grow"></div>
            <button (click)="deleteSelectedEntries()" class="p-2 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900 transition-colors" aria-label="Delete selected entries">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
            </button>
          </div>
        } @else {
          <!-- Default Header -->
          <div class="flex items-center space-x-4">
            <button (click)="close.emit()" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Back to home">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <h1 class="text-xl sm:text-2xl font-bold truncate" [title]="ledger().name">{{ ledger().name }}</h1>
              <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Created: {{ ledger().createdAt.toLocaleDateString() }}
              </p>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <button (click)="exportToExcel()" [disabled]="isExportingExcel()" class="p-2 rounded-lg flex items-center justify-center space-x-2 text-sm bg-[#A6F4A6] dark:bg-green-800 text-black dark:text-slate-100 transition-all duration-250 ease-in-out hover:scale-105 hover:shadow-lg hover:shadow-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed w-24">
              @if (isExportingExcel()) {
                  <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                  <path d="M10 3.75a.75.75 0 0 1 .75.75v3.75h3.75a.75.75 0 0 1 0 1.5h-3.75v3.75a.75.75 0 0 1-1.5 0v-3.75H5.25a.75.75 0 0 1 0-1.5h3.75V4.5a.75.75 0 0 1 .75-.75Z" />
                  <path fill-rule="evenodd" d="M9.664 1.319a.75.75 0 0 1 .672 0l6.25 3.553a.75.75 0 0 1 0 1.319l-6.25 3.553a.75.75 0 0 1-.672 0l-6.25-3.553a.75.75 0 0 1 0-1.319l6.25-3.553Zm-5.43 4.28 5.43 3.091 5.43-3.09-5.43-3.09-5.43 3.09Z" clip-rule="evenodd" />
                  <path d="M3 13.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" />
                </svg>
                <span>Excel</span>
              }
            </button>
            <button (click)="exportToPdf()" [disabled]="isExportingPdf()" class="p-2 rounded-lg flex items-center justify-center space-x-2 text-sm bg-[#FFB3B3] dark:bg-red-800 text-black dark:text-slate-100 transition-all duration-250 ease-in-out hover:scale-105 hover:shadow-lg hover:shadow-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed w-24">
              @if (isExportingPdf()) {
                  <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                  <path fill-rule="evenodd" d="M10 2a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-1.5 0v-.5A.75.75 0 0 1 10 2ZM5.044 3.75a.75.75 0 0 1 .522.258l2.002 2.002a.75.75 0 0 1-1.06 1.06L4.506 5.068a.75.75 0 0 1 .538-1.318Zm9.912 0a.75.75 0 0 1 .538 1.318l-2.002 2.002a.75.75 0 0 1-1.06-1.06l2.002-2.002a.75.75 0 0 1 .522-.258ZM10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM2 10a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 2 10Zm15 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm-5.044 5.044a.75.75 0 0 1-.522.258l-2.002-2.002a.75.75 0 0 1 1.06-1.06l2.002 2.002a.75.75 0 0 1-.538 1.318Zm-4.824-2.252a.75.75 0 0 1 1.06 0l2.002 2.002a.75.75 0 0 1-1.06 1.06L4.72 13.852a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                  <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-5.901-2.453a.75.75 0 0 1-.398-1.42l1.643-.95a.75.75 0 1 1 .796 1.378l-1.643.95a.75.75 0 0 1-.398.042Zm11.802 0a.75.75 0 0 1-.398-.042l-1.643-.95a.75.75 0 1 1 .796-1.378l1.643.95a.75.75 0 0 1-.398 1.42Z" />
                </svg>
                <span>PDF</span>
              }
            </button>
          </div>
        }
      </header>

      <!-- Main content -->
      <main class="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
            <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400">Cash In</h3>
            <p class="text-3xl font-bold text-green-500 mt-2">+₹{{ totalCashIn() | number:'1.2-2' }}</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
            <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400">Cash Out</h3>
            <p class="text-3xl font-bold text-red-500 mt-2">-₹{{ totalCashOut() | number:'1.2-2' }}</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
            <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400">Balance</h3>
            <p class="text-3xl font-bold text-indigo-500 mt-2">₹{{ balance() | number:'1.2-2' }}</p>
          </div>
        </div>

        <!-- Action Buttons -->
        @if (selectedEntries().length === 0) {
          <div class="flex items-center space-x-4 mb-6">
            <button (click)="openAddEntryModal('cash-in')" class="w-full sm:w-auto flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-transform hover:scale-105 flex items-center justify-center space-x-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
              <span>Add Cash In</span>
            </button>
            <button (click)="openAddEntryModal('cash-out')" class="w-full sm:w-auto flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition-transform hover:scale-105 flex items-center justify-center space-x-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M4 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 10Z" clip-rule="evenodd" /></svg>
              <span>Add Cash Out</span>
            </button>
          </div>
        }

        <!-- Entries Table -->
        <div class="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th scope="col" class="p-4 w-10">
                    <label class="flex items-center">
                      <input type="checkbox" [checked]="areAllSelected()" (change)="toggleSelectAll($event)" class="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-100 dark:bg-slate-700">
                      <span class="sr-only">Select all</span>
                    </label>
                  </th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300">Date & Details</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300">Category</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300">Mode</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300 text-right">Amount</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300 text-right">Balance</th>
                  <th scope="col" class="px-6 py-3 font-medium text-slate-600 dark:text-slate-300 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                @if (entriesWithBalance().length > 0) {
                  @for (entry of entriesWithBalance(); track entry.id) {
                    <tr class="border-b border-slate-200 dark:border-slate-800" [class.bg-indigo-50]="isSelected(entry.id)" [class.dark:bg-indigo-900/20]="isSelected(entry.id)">
                      <td class="p-4">
                        <label class="flex items-center">
                          <input type="checkbox" [checked]="isSelected(entry.id)" (change)="toggleSelection(entry.id)" class="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-100 dark:bg-slate-700">
                          <span class="sr-only">Select row</span>
                        </label>
                      </td>
                      <td class="px-6 py-4 font-medium">
                        <div class="flex items-center">
                          <span>{{ entry.details }}</span>
                          @if (entry.attachments && entry.attachments.length > 0) {
                            <button (click)="openAttachmentViewer(entry)" class="ml-2 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.53 9.53l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.452a1.125 1.125 0 0 0 1.59 1.591l3.455-3.553a3 3 0 0 0 0-4.242Z" clip-rule="evenodd" /></svg>
                            </button>
                          }
                        </div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">
                          {{ entry.date | date: 'mediumDate' }} &bull; {{ entry.time }}
                        </div>
                      </td>
                      <td class="px-6 py-4">{{ entry.category }}</td>
                      <td class="px-6 py-4">{{ entry.mode }}</td>
                      <td class="px-6 py-4 font-mono text-right" [class.text-green-600]="entry.type === 'cash-in'" [class.dark:text-green-500]="entry.type === 'cash-in'" [class.text-red-600]="entry.type === 'cash-out'" [class.dark:text-red-500]="entry.type === 'cash-out'">
                        {{ entry.type === 'cash-in' ? '+' : '-' }}₹{{ entry.amount | number:'1.2-2' }}
                      </td>
                      <td class="px-6 py-4 font-mono text-right">₹{{ entry.balance | number:'1.2-2' }}</td>
                      <td class="px-6 py-4">
                        @if (selectedEntries().length === 0) {
                          <div class="flex items-center justify-center space-x-2">
                             <button (click)="openEditEntryModal(entry)" class="p-2 text-slate-500 dark:text-slate-400 rounded-full transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400" aria-label="Edit entry">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" /></svg>
                            </button>
                            <button (click)="deleteEntry(entry.id)" class="p-2 text-slate-500 dark:text-slate-400 rounded-full transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-red-600 dark:hover:text-red-400" aria-label="Delete entry">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
                            </button>
                          </div>
                        }
                      </td>
                    </tr>
                  }
                } @else {
                  <tr>
                    <td colspan="7" class="text-center py-12 px-6">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4 mx-auto">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12.75h.75m2.25 0h.75m2.25 0h.75m2.25 0h.75M8.25 17.25h.75m2.25 0h.75m2.25 0h.75m2.25 0h.75M8.25 21v-3.75c0-.621.504-1.125 1.125-1.125H14.25c.621 0 1.125.504 1.125 1.125V21m-4.875-1.5h.008v.008h-.008v-.008ZM9.75 16.5h.008v.008H9.75v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008ZM9.75 19.5h.008v.008H9.75v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008Zm1.5 0h.008v.008h-.008v-.008ZM8.25 4.5h7.5a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-7.5a2.25 2.25 0 0 1 2.25-2.25Z" />
                      </svg>
                      <p class="font-semibold text-slate-700 dark:text-slate-200">No entries yet</p>
                      <p class="text-slate-500 dark:text-slate-400 mt-1">Click "Add Cash In" or "Add Cash Out" to begin.</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>

    <!-- Add/Edit Entry Modal -->
    @if (isEntryModalVisible()) {
      <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in-fast" (click)="closeEntryModal()">
        <div (click)="$event.stopPropagation()" class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl m-4 max-h-[90vh] flex flex-col">
          <form [formGroup]="entryForm" (ngSubmit)="onSaveEntry()">
            <div class="p-6 border-b border-slate-200 dark:border-slate-700">
               <h2 class="text-2xl font-bold">{{ entryModalTitle() }}</h2>
            </div>
            <div class="p-6 flex-grow overflow-y-auto">
              <!-- Cash In / Cash Out Toggle -->
              <div class="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-700 mb-6">
                <button type="button" (click)="entryForm.controls['type'].setValue('cash-in')"
                        [class.bg-white]="entryForm.value.type === 'cash-in'" [class.dark:bg-slate-800]="entryForm.value.type === 'cash-in'"
                        [class.text-green-600]="entryForm.value.type === 'cash-in'"
                        class="px-4 py-2 rounded-md font-semibold transition-colors text-center">Cash In</button>
                <button type="button" (click)="entryForm.controls['type'].setValue('cash-out')"
                        [class.bg-white]="entryForm.value.type === 'cash-out'" [class.dark:bg-slate-800]="entryForm.value.type === 'cash-out'"
                        [class.text-red-600]="entryForm.value.type === 'cash-out'"
                        class="px-4 py-2 rounded-md font-semibold transition-colors text-center">Cash Out</button>
              </div>

              <!-- Form Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <!-- Date -->
                <div>
                  <label for="date" class="block text-sm font-medium mb-1">Date</label>
                  <input formControlName="date" id="date" type="date" required
                        class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <!-- Time -->
                <div>
                  <label for="time" class="block text-sm font-medium mb-1">Time</label>
                  <input formControlName="time" id="time" type="time" required
                        class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <!-- Details -->
                <div class="md:col-span-2">
                  <label for="details" class="block text-sm font-medium mb-1">Details</label>
                  <input formControlName="details" id="details" type="text" required
                        class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Dinner with team">
                </div>
                <!-- Category -->
                <div>
                  <label for="category" class="block text-sm font-medium mb-1">Category</label>
                  <select formControlName="category" id="category" required
                          class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option>Food</option>
                    <option>Transport</option>
                    <option>Advance</option>
                    <option>Health Care</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <!-- Custom Category / Mode -->
                @if (entryForm.value.category === 'Custom') {
                  <div>
                    <label for="customCategory" class="block text-sm font-medium mb-1">Custom Category</label>
                    <input formControlName="customCategory" id="customCategory" type="text"
                          class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Shopping">
                  </div>
                } @else {
                  <div>
                    <label for="mode" class="block text-sm font-medium mb-1">Mode</label>
                    <input formControlName="mode" id="mode" type="text" required
                          class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Cash, Card, UPI">
                  </div>
                }
                <!-- Amount -->
                <div class="md:col-span-2">
                  <label for="amount" class="block text-sm font-medium mb-1">Amount (₹)</label>
                  <input formControlName="amount" id="amount" type="number" required
                        class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00">
                </div>
                 <!-- Bill Attachments -->
                <div class="md:col-span-2">
                  <label class="block text-sm font-medium mb-1">Bill Attachments (up to 5)</label>
                  <div class="mt-2 flex items-center justify-center w-full">
                      <label for="dropzone-file" class="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600">
                          <div class="flex flex-col items-center justify-center pt-5 pb-6">
                              <svg class="w-8 h-8 mb-4 text-slate-500 dark:text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/></svg>
                              <p class="mb-2 text-sm text-slate-500 dark:text-slate-400"><span class="font-semibold">Click to upload</span> or drag and drop</p>
                              <p class="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, or GIF</p>
                          </div>
                          <input id="dropzone-file" type="file" class="hidden" multiple (change)="onFileSelected($event)" accept="image/*" />
                      </label>
                  </div> 
                  <!-- Image Previews -->
                  @if (attachmentPreviews().length > 0) {
                    <div class="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-4">
                      @for (preview of attachmentPreviews(); track preview.name) {
                        <div class="relative group">
                          <img [src]="preview.url" [alt]="preview.name" class="h-24 w-full object-cover rounded-lg">
                          <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button (click)="removeAttachment(preview.name)" type="button" class="text-white p-1 bg-red-600/80 rounded-full hover:bg-red-600">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
                <!-- Notes -->
                <div class="md:col-span-2">
                  <label for="notes" class="block text-sm font-medium mb-1">Notes (Optional)</label>
                  <textarea formControlName="notes" id="notes" rows="3"
                            class="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Any extra details..."></textarea>
                </div>
              </div>
            </div>
            <div class="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-4 flex-shrink-0">
              <button type="button" (click)="closeEntryModal()" class="px-6 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">
                Cancel
              </button>
              <button type="submit" [disabled]="entryForm.invalid" 
                      class="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:bg-indigo-400 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed">
                {{ entryModalSubmitButtonText() }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Attachment Viewer Modal (Carousel) -->
    @if (isAttachmentViewerVisible()) {
      <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in-fast" (click)="closeAttachmentViewer()">
        <div (click)="$event.stopPropagation()" class="relative w-full h-full max-w-4xl max-h-4xl p-4 sm:p-8">
          <img [src]="currentAttachmentUrl()" alt="Attachment Preview" class="w-full h-full object-contain">
          <!-- Close Button -->
          <button (click)="closeAttachmentViewer()" class="absolute top-2 right-2 sm:top-4 sm:right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
          <!-- Navigation -->
          @if (attachmentsForViewer().length > 1) {
            <!-- Previous Button -->
            <button (click)="showPrevAttachment()" class="absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 text-white bg-black/50 rounded-full p-2 hover:bg-black/80">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1 0 1.06L9.06 10l3.73 3.71a.75.75 0 1 1-1.06 1.06L7.47 10.53a.75.75 0 0 1 0-1.06l4.26-4.24a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" /></svg>
            </button>
            <!-- Next Button -->
            <button (click)="showNextAttachment()" class="absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 text-white bg-black/50 rounded-full p-2 hover:bg-black/80">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 0-1.06L10.94 10 7.21 6.29a.75.75 0 1 1 1.06-1.06l4.24 4.24a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0Z" clip-rule="evenodd" /></svg>
            </button>
            <!-- Counter -->
            <div class="absolute bottom-2 left-1/2 -translate-x-1/2 text-white bg-black/50 rounded-full px-3 py-1 text-sm">
              {{ currentAttachmentIndex() + 1 }} / {{ attachmentsForViewer().length }}
            </div>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DecimalPipe]
})
export class LedgerDetailsComponent implements OnInit {
  ledger = input.required<Ledger>();
  close = output<void>();
  ledgerUpdate = output<Ledger>();

  private fb = inject(FormBuilder);
  
  entries = signal<Entry[]>([]);

  isEntryModalVisible = signal(false);
  editingEntry = signal<Entry | null>(null);

  isAttachmentViewerVisible = signal(false);
  attachmentsForViewer = signal<string[]>([]);
  currentAttachmentIndex = signal(0);
  
  isExportingExcel = signal(false);
  isExportingPdf = signal(false);

  selectedEntries = signal<string[]>([]);
  
  attachmentPreviews = signal<{name: string, url: string}[]>([]);

  entryModalTitle = computed(() => this.editingEntry() ? 'Edit Entry' : 'Add New Entry');
  entryModalSubmitButtonText = computed(() => this.editingEntry() ? 'Update' : 'Add');
  currentAttachmentUrl = computed(() => this.attachmentsForViewer()[this.currentAttachmentIndex()]);

  // Financial Computations
  totalCashIn = computed(() => this.entries().filter(e => e.type === 'cash-in').reduce((sum, e) => sum + e.amount, 0));
  totalCashOut = computed(() => this.entries().filter(e => e.type === 'cash-out').reduce((sum, e) => sum + e.amount, 0));
  balance = computed(() => this.totalCashIn() - this.totalCashOut());

  // Table computations
  entriesWithBalance = computed(() => {
    let runningBalance = 0;
    // Sort entries by date and then time to ensure correct balance calculation
    const sortedEntries = [...this.entries()].sort((a, b) => {
      const dateComparison = a.date.localeCompare(b.date);
      if (dateComparison !== 0) return dateComparison;
      return a.time.localeCompare(b.time);
    });

    return sortedEntries.map(entry => {
      runningBalance += entry.type === 'cash-in' ? entry.amount : -entry.amount;
      return { ...entry, balance: runningBalance };
    });
  });
  
  areAllSelected = computed(() => {
    const numEntries = this.entries().length;
    return numEntries > 0 && this.selectedEntries().length === numEntries;
  });

  constructor() {
     // This effect automatically emits the updated ledger whenever entries change.
    effect(() => {
      const updatedLedger: Ledger = {
        ...this.ledger(),
        entries: this.entries()
      };
      this.ledgerUpdate.emit(updatedLedger);
    });
  }

  ngOnInit() {
    this.entries.set(this.ledger().entries);
  }

  // --- Entry Modal Methods ---
  openAddEntryModal(type: 'cash-in' | 'cash-out') {
    this.editingEntry.set(null);
    this.entryForm.reset({
      type: type,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      details: '', category: 'Food', mode: 'Cash', amount: null, notes: ''
    });
    this.attachmentPreviews.set([]);
    this.isEntryModalVisible.set(true);
  }

  openEditEntryModal(entry: Entry) {
    this.editingEntry.set(entry);
    const categoryExists = ['Food', 'Transport', 'Advance', 'Health Care'].includes(entry.category);
    this.entryForm.reset({
      ...entry,
      category: categoryExists ? entry.category : 'Custom',
      customCategory: categoryExists ? '' : entry.category
    });
    
    const previews = (entry.attachments || []).map(url => ({ name: url, url }));
    this.attachmentPreviews.set(previews);
    
    this.isEntryModalVisible.set(true);
  }

  closeEntryModal() {
    this.isEntryModalVisible.set(false);
    this.editingEntry.set(null);
    this.attachmentPreviews.set([]);
  }

  entryForm = this.fb.group({
    type: ['cash-out' as 'cash-in' | 'cash-out', Validators.required],
    date: ['', Validators.required],
    time: ['', Validators.required],
    details: ['', Validators.required],
    category: ['Food', Validators.required],
    customCategory: [''],
    mode: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    notes: [''],
  });

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const files = Array.from(input.files).slice(0, 5 - this.attachmentPreviews().length);
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          this.attachmentPreviews.update(current => [...current, { name: file.name, url: reader.result as string }]);
        };
        reader.readAsDataURL(file);
      }
    }
  }

  removeAttachment(name: string) {
    this.attachmentPreviews.update(current => current.filter(p => p.name !== name));
  }
  
  onSaveEntry() {
    if (this.entryForm.invalid) return;

    const formValue = this.entryForm.getRawValue();
    const finalCategory = formValue.category === 'Custom' ? (formValue.customCategory || 'Custom') : formValue.category;

    const newEntryData = {
        details: formValue.details!,
        date: formValue.date!,
        time: formValue.time!,
        type: formValue.type!,
        category: finalCategory!,
        mode: formValue.mode!,
        amount: formValue.amount!,
        attachments: this.attachmentPreviews().map(p => p.url)
    };
    
    // Conditionally add notes only if it has a value
    const finalEntry: Partial<Entry> = { ...newEntryData };
    if (formValue.notes) {
        finalEntry.notes = formValue.notes;
    }

    const currentEntry = this.editingEntry();
    if (currentEntry) {
      // Update existing entry
      this.entries.update(entries =>
        entries.map(e => e.id === currentEntry.id ? { ...e, ...finalEntry } : e)
      );
    } else {
      // Add new entry
      const newEntry: Entry = {
        ...finalEntry as Omit<Entry, 'id'>,
        id: new Date().getTime().toString()
      };
      this.entries.update(entries => [...entries, newEntry]);
    }

    this.closeEntryModal();
  }

  deleteEntry(id: string) {
    this.entries.update(entries => entries.filter(e => e.id !== id));
  }

  // --- Attachment Viewer Methods ---
  openAttachmentViewer(entry: Entry) {
    if (entry.attachments && entry.attachments.length > 0) {
      this.attachmentsForViewer.set(entry.attachments);
      this.currentAttachmentIndex.set(0);
      this.isAttachmentViewerVisible.set(true);
    }
  }
  closeAttachmentViewer() {
    this.isAttachmentViewerVisible.set(false);
  }
  showNextAttachment() {
    this.currentAttachmentIndex.update(i => (i + 1) % this.attachmentsForViewer().length);
  }
  showPrevAttachment() {
    this.currentAttachmentIndex.update(i => (i - 1 + this.attachmentsForViewer().length) % this.attachmentsForViewer().length);
  }

  // --- Multi-select methods ---
  toggleSelection(id: string) {
    this.selectedEntries.update(current => {
      const newSelection = new Set(current);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return Array.from(newSelection);
    });
  }

  toggleSelectAll(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.selectedEntries.set(this.entries().map(e => e.id));
    } else {
      this.selectedEntries.set([]);
    }
  }
  
  isSelected(id: string): boolean {
    return this.selectedEntries().includes(id);
  }

  clearSelection() {
    this.selectedEntries.set([]);
  }

  deleteSelectedEntries() {
    const selectedIds = new Set(this.selectedEntries());
    this.entries.update(current => current.filter(entry => !selectedIds.has(entry.id)));
    this.clearSelection();
  }

  // --- Export Methods ---
  async exportToExcel() {
    this.isExportingExcel.set(true);
    // Give the UI a moment to update
    await new Promise(resolve => setTimeout(resolve, 50));

    const data = this.entriesWithBalance().map(entry => {
      return {
        Date: new Date(entry.date + 'T' + entry.time).toLocaleString(),
        Details: entry.details,
        Category: entry.category,
        Mode: entry.mode,
        'Cash In': entry.type === 'cash-in' ? entry.amount : '',
        'Cash Out': entry.type === 'cash-out' ? entry.amount : '',
      };
    });
    
    const totalIn = this.totalCashIn();
    const totalOut = this.totalCashOut();
    const balance = this.balance();

    const summary = [
        { Date: '', Details: '', Category: '', Mode: '', 'Cash In': '', 'Cash Out': '' }, // empty row for spacing
        { Date: '', Details: 'TOTAL', Category: '', Mode: '', 'Cash In': totalIn, 'Cash Out': totalOut },
        { Date: '', Details: 'BALANCE', Category: '', Mode: '', 'Cash In': balance, 'Cash Out': '' }
    ];

    const worksheet = XLSX.utils.json_to_sheet(data.concat(summary));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger Details');
    XLSX.writeFile(workbook, `${this.ledger().name.replace(/ /g,"_")}_Export.xlsx`);

    this.isExportingExcel.set(false);
  }

  async exportToPdf() {
    this.isExportingPdf.set(true);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const allAttachments = this.entries()
        .flatMap(entry => entry.attachments || [])
        .filter(url => url); // Ensure no empty URLs

    if (allAttachments.length === 0) {
        alert('No attachments found to export.');
        this.isExportingPdf.set(false);
        return;
    }

    const { jsPDF: JSPDF } = (window as any).jspdf;
    const pdf = new JSPDF();
    
    for (let i = 0; i < allAttachments.length; i++) {
        const imageUrl = allAttachments[i];
        if (i > 0) {
            pdf.addPage();
        }
        
        try {
            const img = new Image();
            img.crossOrigin = 'Anonymous'; // Required for external images
            
            await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const pageRatio = pageWidth / pageHeight;
                    const imgRatio = img.width / img.height;

                    let imgWidth, imgHeight, x, y;

                    if (imgRatio > pageRatio) { // Image is wider than page
                        imgWidth = pageWidth - 20; // 10 margin on each side
                        imgHeight = imgWidth / imgRatio;
                    } else { // Image is taller than page
                        imgHeight = pageHeight - 20;
                        imgWidth = imgHeight * imgRatio;
                    }

                    x = (pageWidth - imgWidth) / 2;
                    y = (pageHeight - imgHeight) / 2;

                    pdf.addImage(img, 'JPEG', x, y, imgWidth, imgHeight);
                    resolve();
                };
                img.onerror = reject;
                img.src = imageUrl;
            });
        } catch (error) {
            console.error('Could not add image to PDF:', imageUrl, error);
            // Add a placeholder page in case of error
            pdf.text(`Could not load image: ${imageUrl}`, 10, 10);
        }
    }
    
    pdf.save(`${this.ledger().name}_Bills.pdf`);
    this.isExportingPdf.set(false);
  }
}