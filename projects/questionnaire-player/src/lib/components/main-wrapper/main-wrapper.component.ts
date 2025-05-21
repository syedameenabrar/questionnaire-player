import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  booleanAttribute,
} from '@angular/core';
import {
  ApiConfiguration,
  Evidence,
  Question,
  Section,
} from '../../interfaces/questionnaire.type';
import { FormBuilder, FormGroup } from '@angular/forms';
import { QuestionnaireService } from '../../services/questionnaire.service';
import { MatDialog } from '@angular/material/dialog';
import { MainComponent } from '../main/main.component';
import { ApiService } from '../../services/api.service';
import { catchError } from 'rxjs/operators';
import * as urlConfig from '../../constants/url-config.json';
import { ToastService } from '../../services/toast.service';
import { ThemePalette } from '@angular/material/core';
import { ProgressSpinnerMode } from '@angular/material/progress-spinner';
import { firstValueFrom, Observable, Subscribable, Subscription } from 'rxjs';
import { AlertComponent } from '../alert/alert.component';
import { Location } from '@angular/common';
import { BackNavigationHandlerComponent } from '../../shared/components/pie-chart/back-navigation-handler/back-navigation-handler.component';
import { Router } from '@angular/router';
import { SharedService } from '../../services/shared.service';
import { QueryParamsService } from '../../services/queryParams.service';
import { DbService } from '../../services/db/db.service';
import { AttachmentService } from '../../services/attachment/attachment.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
@Component({
  selector: 'lib-main-wrapper',
  templateUrl: './main-wrapper.component.html',
  styleUrls: ['./main-wrapper.component.scss'],
})
export class MainWrapperComponent extends BackNavigationHandlerComponent implements OnInit, OnChanges, OnDestroy {
  questions: Array<Question>;
  @Input({ transform: booleanAttribute }) angular = false;
  evidence: Evidence;
  sections: Section[];
  questionnaireForm: FormGroup;

  @Input() apiConfig: ApiConfiguration;
  @ViewChild('questionMapModal') public questionMapModal: TemplateRef<any>;
  @ViewChild('mainComponent') public mainComponent: MainComponent;
  questionMap = {};
  pageMsg = new Map();
  endDate: Date;
  sectionName: string;
  listing = false;
  assessment: any;
  loaded = false;
  color: ThemePalette = 'primary';
  mode: ProgressSpinnerMode = 'indeterminate';
  strokeWidth = 4;
  dialogRef: any;
  isExpired: boolean;
  @Input() saveQuestioner: boolean = false;
  subscription: Subscription;
  isOnline: boolean = true;
  stateData:any;

  constructor(
    public fb: FormBuilder,
    private dialog: MatDialog,
    public questionnaireService: QuestionnaireService,
    public apiService: ApiService,
    public toaster: ToastService,
    public location: Location,
    private renderer: Renderer2, private el: ElementRef,
    public router: Router,
    private sharedService: SharedService,
    private queryParamsService: QueryParamsService,
    private db: DbService,
    private attachmentService: AttachmentService,
    private http: HttpClient,

  ) {
    super(router, location);
  }

  checkFormValidity() {
    window.parent.postMessage({
      type: 'formDirty',
      isDirty: this.questionnaireForm.dirty
    }, '*');
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (
      this.angular &&
      changes['apiConfig'] &&
      changes['apiConfig'].previousValue == undefined &&
      changes['apiConfig'].currentValue
    ) {
      this.setApiService();
      let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
      if (!isDataInlocalSotrage) {
        this.setApiService();
        this.apiService.stateData ? this.getQuestions(this.apiService.stateData):this.fetchDetails();
      }

      if (this.sections?.length == 1) {
        this.setSection(this.sections[0].name);
        if (document.getElementById('observation-ion-toolbar')) {
          document.getElementById('observation-ion-toolbar').style.display = 'none'
        }
        this.listing = false;
      }
    }

    if (changes['saveQuestioner']) {
      if (this.saveQuestioner == true) {
        this.submission('draft');
      }
    }
  }

  async ngOnInit() {

    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
    if (typeof this.apiConfig === 'string') {
      try {
        this.apiConfig = JSON.parse(this.apiConfig);

        if (!isDataInlocalSotrage) {
          this.setApiService();
          this.apiService.stateData ? this.getQuestions(this.apiService.stateData):this.fetchDetails();
        }

      } catch (error) {
        throw new Error('Invalid Assessment Structure', error);
      }
    }
    if (this.sections?.length == 1) {
      this.setSection(this.sections[0].name);
      if (document.getElementById('observation-ion-toolbar')) {
        document.getElementById('observation-ion-toolbar').style.display = 'none'
      }
      this.listing = false;
    }
    this.questionnaireForm = this.fb.group({});

    this.questionnaireForm.valueChanges.subscribe((data: any) => {
      this.checkFormValidity();
    })

    this.attachmentService.trigger$.subscribe(() => {
      const evidenceData = this.questionnaireService.getEvidenceData(
        this.evidence,
        this.questionnaireForm.value
      );

      evidenceData['status'] = 'draft';
      const submissionData = {
        status: "draft",
        ...evidenceData,
      };
      this.updateDataInIndexDb(submissionData);
    });
  }

  getQueryParms() {
    this.queryParamsService.parseQueryParams();
    let queryParamsData = {
      indexDbKey: `${this.queryParamsService?.submissionId}`,
      evidenceCode: `${this.queryParamsService?.evidenceCode}`
    }
    return queryParamsData
  }

  async setDataInIndexDb() {
    const queryParamsData = this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;

    const data = {
      key: indexDbKey,
      data: this.assessment
    }
    try {
      await this.db.addData(data);
    } catch (error) {
      console.error("Failed to store data in IndexedDB", error);
    }
  }

  async updateDataInIndexDb(updatedAnswers) {
    const queryParamsData = this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;
    const evidenceCode = queryParamsData?.evidenceCode;

    if (this.assessment.assessment.submissions[evidenceCode]) {
      this.assessment.assessment.submissions[evidenceCode].answers = updatedAnswers?.answers;
      this.assessment.assessment.submissions[evidenceCode].status = updatedAnswers?.status == 'draft' ? 'draft' : 'submit';
      this.assessment.assessment.evidences[+[this.apiConfig.index]].isSubmitted = updatedAnswers?.status == 'draft' ? false : true;
    } else {
      this.assessment.assessment.submissions[evidenceCode] = {
        externalId: evidenceCode,
        answers: updatedAnswers?.answers,
        startTime: Date.now(),
        endTime: this.endDate,
        gpsLocation: null,
        submittedBy: '',
        submittedByName: '',
        submissionDate: new Date().toISOString(),
        isValid: true,
        status: updatedAnswers?.status == 'draft' ? 'draft' : 'submit'
      };
    }

    const data = {
      key: indexDbKey,
      data: this.assessment
    }
    try {
      await this.db.updateData(data);
    } catch (error) {
      console.error("Failed to store data in IndexedDB", error);
    }
  }

  deleteFromIndexDb() {
    const queryParamsData = this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;
    this.db.deleteData(indexDbKey);
  }


  async checkAndMapIndexDbDataToVariables() {
    const queryParamsData = this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;
    let indexdbData = await this.db.getData(indexDbKey);
    let currentObservation = indexdbData?.data;
    if (currentObservation) {
      this.assessment = this.questionnaireService.mapSubmissionToAssessment(
        currentObservation
      );
      this.evidence = this.apiConfig?.solutionType == 'observation' ? currentObservation?.assessment?.evidences[+[this.apiConfig.index]] : currentObservation?.assessment?.evidences[0];
      this.evidence.startTime = Date.now();
      this.endDate = new Date(
        new Date(currentObservation?.assessment?.endDate).getTime() +
        new Date(currentObservation?.assessment?.endDate).getTimezoneOffset() *
        60000
      );
      this.isExpired = currentObservation?.assessment?.status == 'expired' || false;
      this.sections = this.evidence?.sections;
      if (this.sections?.length == 1) {
        this.setSection(this.sections[0].name);
        if (document.getElementById('observation-ion-toolbar')) {
          document.getElementById('observation-ion-toolbar').style.display = 'none'
        }
        this.listing = false
      }
      this.questionnaireForm = this.fb.group({});

      this.questionnaireForm.valueChanges.subscribe((data: any) => {
        this.checkFormValidity();
      })
      this.loaded = true;

    }
    return currentObservation ? true : false;
  }

  setApiService() {
    this.apiService.baseUrl = this.apiConfig.baseURL;
    this.apiService.token = this.apiConfig.userAuthToken;
    this.apiService.solutionType = this.apiConfig.solutionType;
    this.apiService.observationId = this.apiConfig.observationId;
    this.apiService.entityId = this.apiConfig.entityId;
    this.apiService.submissionNumber = this.apiConfig.submissionNumber;
    this.apiService.evidenceCode = this.apiConfig.evidenceCode;
    this.apiService.index = this.apiConfig.index;

    this.apiService.profileData = this.apiConfig.profileData;
    this.apiService.stateData = this.apiConfig.stateData;

    this.stateData=this.apiConfig.stateData
  }

  fetchDetails() {
    const path = this.apiConfig.solutionType == 'observation' ? this.apiConfig.observationId + `?entityId=${this.apiConfig.entityId}&submissionNumber=${this.apiConfig.submissionNumber}&evidenceCode=${this.apiConfig.evidenceCode}` : this.apiConfig.solutionId
    this.subscription = this.apiService.post(`${urlConfig[this.apiConfig.solutionType].details}` + path, this.apiConfig.profileData)
      .pipe(
        catchError((err) => {
          throw new Error('Could not fetch the details');
        })
      )
      .subscribe(async (res: any) => {
        if (res.result) {
          this.assessment = this.questionnaireService.mapSubmissionToAssessment(
            res.result
          );
          this.evidence = this.apiConfig?.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];
          this.evidence.startTime = Date.now();
          this.endDate = new Date(
            new Date(this.assessment?.assessment?.endDate).getTime() +
            new Date(this.assessment?.assessment?.endDate).getTimezoneOffset() *
            60000
          );
          this.isExpired = this.assessment?.assessment?.status == 'expired';
          this.sections = this.evidence?.sections;
          this.loaded = true;

        } else {
          this.toaster.showToast('Something went wrong, Please try again later', 'danger', 5000)
        }

      });
  }



  getQuestionMap() {
    for (
      let sectionIndex = 0;
      sectionIndex < this.sections.length;
      sectionIndex++
    ) {
      for (
        let questionIndex = 0;
        questionIndex < this.sections[sectionIndex].questions.length;
        questionIndex++
      ) {
        this.questionMap[
          `${this.sections[sectionIndex].name} - Page ${questionIndex + 1}`
        ] = [];
        if (
          this.sections[sectionIndex].questions[questionIndex].responseType ==
          'pageQuestions'
        ) {
          for (
            let pqIndex = 0;
            pqIndex <
            this.sections[sectionIndex].questions[questionIndex].pageQuestions
              .length;
            pqIndex++
          ) {
            if (
              (Array.isArray(
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].visibleIf
              ) &&
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].canDisplay) ||
              !Array.isArray(
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].visibleIf
              )
            ) {
              let value =
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].value;
              if (
                !this.questionnaireForm.controls[
                  this.sections[sectionIndex].questions[questionIndex]
                    .pageQuestions[pqIndex]._id
                ].valid
              ) {
                value = [];
              }
              if (
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].responseType == 'slider'
              ) {
                this.pageMsg.set(
                  `${this.sections[sectionIndex].name} - Page ${questionIndex + 1}`,
                  'Please review your response to the slider question on this page'
                );
              }
              this.setQuestionMap(
                sectionIndex,
                questionIndex,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].validation,
                value,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex]._id,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].questionNumber
              );
            }
          }
        } else {
          if (
            (Array.isArray(
              this.sections[sectionIndex].questions[questionIndex].visibleIf
            ) &&
              this.sections[sectionIndex].questions[questionIndex]
                .canDisplay) ||
            !Array.isArray(
              this.sections[sectionIndex].questions[questionIndex].visibleIf
            )
          ) {
            let value =
              this.sections[sectionIndex].questions[questionIndex].value;
            if (
              !this.questionnaireForm.controls[
                this.sections[sectionIndex].questions[questionIndex]._id
              ].valid
            ) {
              value = [];
            }
            if (
              this.sections[sectionIndex].questions[questionIndex]
                .responseType == 'slider'
            ) {
              this.pageMsg.set(
                `${this.sections[sectionIndex].name} - Page ${questionIndex + 1}`,
                'Please review your response to the slider question on this page'
              );
            }
            this.setQuestionMap(
              sectionIndex,
              questionIndex,
              this.sections[sectionIndex].questions[questionIndex].validation,
              value,
              this.sections[sectionIndex].questions[questionIndex]._id,
              this.sections[sectionIndex].questions[questionIndex]
                .questionNumber
            );
          }
        }
      }
    }
    this.dialog.open(this.questionMapModal, {
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true,
      hasBackdrop: true,
    });
  }

  setQuestionMap(sectionIndex, qIndex, qValidation, qValue, questionId, qNum) {
    const validation = qValidation;
    const value = qValue;
    const question = {
      _id: questionId,
      validity:
        (value && value.length > 0) || Number.isInteger(value)
          ? '#006600'
          : typeof validation !== 'string' && validation.required
            ? '#A30000'
            : '#595959',
      sectionName: this.sections[sectionIndex].name,
      pageIndex: qIndex,
      questionNumber: qNum,
    };
    this.questionMap[`${this.sections[sectionIndex].name} - Page ${qIndex + 1}`].push(
      question
    );
  }

  enableRelevantPage() {
    for (let i = 0; i < this.sections.length; i++) {
      if (this.sections[i].name !== this.sectionName) {
        this.domQuery(this.sections[i].name, 'none');
      }
    }
    this.domQuery(this.sectionName, 'block');
    if (document.getElementById('observation-ion-toolbar')) {
      document.getElementById('observation-ion-toolbar').style.display = 'block'
    }

  }

  domQuery(elemendId: string, action: string) {
    if (document.getElementById(`${elemendId}`)) {
      document.getElementById(`${elemendId}`).style.display = action;
    }
  }

  submission(status) {
    const evidenceData = this.questionnaireService.getEvidenceData(
      this.evidence,
      this.questionnaireForm.value
    );

    status == 'save' ? (evidenceData['status'] = 'draft') : null;
    const submissionData = {
      status: status,
      ...evidenceData,
    };
    this.submitSurvey(submissionData);
  }

  async submitImageToCloud(data): Promise<any> {
    const payload: any = {
      ref: 'survey',
      request: {
        [data.submissionId]: {
          files: [data.name],
        }
      }
    };

    try {
      const response: any = await firstValueFrom(
        this.apiService.post(urlConfig.presignedUrl, payload)
      );

      const presignedUrlData = response.result[data.submissionId].files[0];
      const headers = new HttpHeaders({
        'Content-Type': 'multipart/form-data',
        "x-ms-blob-type": "BlockBlob",
      });

      await firstValueFrom(
        this.http.put(presignedUrlData.url, data.file, { headers })
      );

      const obj: any = {
        name: data.name,
        url: presignedUrlData.url.split('?')[0],
        previewUrl: presignedUrlData.url.split('?')[0],
        question_id: data.question_id,
      };

      for (const key of Object.keys(presignedUrlData.payload)) {
        obj[key] = presignedUrlData.payload[key];
      }

      return obj;

    } catch (err) {
      console.error('Upload failed', err);
      throw err;
    }
  }


  async submitSurvey(submissionData) {
    if (submissionData.status !== 'draft') {
  
      if (!this.saveQuestioner) {
        const confirmationParams = {
          title: 'Confirmation',
          message: `Are you sure you want to submit the ${this.apiConfig.solutionType}?`,
          actionBtns: true,
          cancelLabel: 'Cancel',
          acceptLabel: 'Confirm',
        };
        const response = await this.openAlert(confirmationParams);
        if(response){
          const answers = submissionData?.answers;
  
          for (let [qid, answerObj] of Object.entries(answers)) {
            const answer = answerObj as { fileName?: any[] }; 
            const files = answer.fileName || [];
            for (let file of files) {
              if (!file?.isUploaded) {
                const storedFile: any = await this.db.getData(file?.name);
                if (!storedFile || !storedFile.data) continue;
        
                const convertedFile = this.attachmentService.base64ToFile(storedFile.data);
                file.file = convertedFile;
        
                const presignedUrlData: any = await this.submitImageToCloud(file);
        
                file.isUploaded = true;
                file.previewUrl = presignedUrlData.url.split('?')[0];
                file.url = presignedUrlData.url.split('?')[0];
                file.file = "";
        
                this.updateDataInIndexDb(submissionData);
              }
            }
          }
          
        }
        if (!response) return;
      }
    
      this.apiService
        .post(
          `${urlConfig[this.apiConfig.solutionType].update}${this.assessment.assessment.submissionId}`,
          { evidence: submissionData }
        )
        .pipe(
          catchError((err) => {
            this.toaster.showToast(err?.error?.message, 'danger', 5000);
            throw new Error(`Update API has failed`);
          })
        )
        .subscribe((res: any) => {
          if (res.status === 200 && !this.saveQuestioner) {
            this.formIsNotDirty();
            const footer = this.el.nativeElement.querySelector('.footer-buttons');
            this.renderer.setStyle(footer, 'display', 'none');
            this.toaster.showToast(
              `Your ${this.apiConfig.solutionType} has been submitted successfully.`,
              'success',
              5000
            );
            this.evidence.isSubmitted = true;
          }
        });
    } else {
      this.updateDataInIndexDb(submissionData);
  
      if (!this.saveQuestioner) {
        this.formIsNotDirty();
        const confirmationParams = {
          title: 'Success',
          message: `Successfully your ${this.apiConfig.solutionType} has been saved. Do you want to continue?`,
          acceptLabel: 'Later',
          cancelLabel: 'Continue',
          type: 'success',
        };
        const response = await this.openAlert(confirmationParams);
        if (response) {
          if (this.sections?.length > 1) {
            this.backToSectionListing();
          } else {
            this.location.back();
          }
        }
      }
    }
  }
  

  async openAlert(alertDialogConfig) {
    const dialogRef = await this.dialog.open(AlertComponent, {
      data: alertDialogConfig,
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true
    });

    this.dialogRef = dialogRef

    return new Observable<boolean>((observer) => {
      dialogRef.afterClosed().subscribe((res) => {
        if (res) {
          this.dialogRef.close();
        }
        observer.next(res);
        observer.complete();
      });
    }).toPromise();
  }

  setSection(name: string) {
    this.sectionName = name;
    this.enableRelevantPage();
    if (document.getElementById('observation-ion-toolbar')) {
      document.getElementById('observation-ion-toolbar').style.display = 'none'
    }
    this.mainComponent?.enableRelevantPage();
    let sectionElements = document.getElementsByClassName('section-listing');
    if (sectionElements.length > 0) {
      for (let i = 0; i < sectionElements.length; i++) {
        (sectionElements[i] as HTMLElement).style.display = 'none';
      }
    }
    this.listing = true;
  }

  backToSectionListing() {
    this.listing = false;
    this.domQuery(this.sectionName, 'none');
    if (document.getElementById('observation-ion-toolbar')) {
      document.getElementById('observation-ion-toolbar').style.display = 'block'
    }
    let sectionElements = document.getElementsByClassName('section-listing');
    this.mainComponent.pageIndex = 0;
    this.mainComponent.handlePageEvent({ pageIndex: 0 })
    if (sectionElements.length > 0) {
      for (let i = 0; i < sectionElements.length; i++) {
        (sectionElements[i] as HTMLElement).style.display = 'block';
      }
    }
    if (this.sections.length == 1) {
      this.location.back();
    }
  }

  closeModal() {
    this.dialog.closeAll();
  }

  goToQuestion(id, pageIndex, sectionName) {
    this.setSection(sectionName)
    this.mainComponent.pageIndex = pageIndex;
    this.mainComponent.handlePageEvent({ pageIndex: pageIndex })
    this.closeModal();
  }

  formIsNotDirty() {
    window.parent.postMessage({
      type: 'formDirty',
      isDirty: false
    }, '*');
  }

  ngOnDestroy(): void {
    if (this.apiConfig.solutionType == 'observation' && this.questionnaireForm.dirty) {
      this.saveQuestioner = true;
      this.submission('draft');
      this.subscription?.unsubscribe();
      this.sharedService.updateValue(false);
      this.questionnaireForm.reset();
      if (document.getElementById('observation-ion-toolbar')) {
        document.getElementById('observation-ion-toolbar').style.display = 'block';
      }
    }
  }



  async start(){

    const message = { type: 'START', data: this.stateData };

    window.postMessage(message, '*');

  }

  getQuestions(data){

    if(data?.isATargetedSolution === false){

      this.toaster.showToast('Dear User, this Observation is not relevant for your subrole and location', 'danger', 5000)

    }

    this.assessment = this.questionnaireService.mapSubmissionToAssessment(

      data

    );

    this.evidence = this.apiConfig?.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];

    this.evidence.startTime = Date.now();

    this.endDate = new Date(

      new Date(this.assessment?.assessment?.endDate).getTime() +

      new Date(this.assessment?.assessment?.endDate).getTimezoneOffset() *

      60000

    );

    this.isExpired = this.assessment?.assessment?.status == 'expired';

    this.sections = this.evidence?.sections;

    this.loaded = true;

  }

}
