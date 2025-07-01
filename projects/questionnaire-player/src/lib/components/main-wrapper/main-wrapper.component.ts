import {
  CSP_NONCE,
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
// import { BackNavigationHandlerComponent } from '../../shared/components/pie-chart/back-navigation-handler/back-navigation-handler.component';
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
export class MainWrapperComponent implements OnInit, OnChanges, OnDestroy {
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
  stateData: any;
  submissionId:any;
  evidenceCode:any;
  solutionType :any;
  uploading:boolean= false;
  totalFileToUpload:any = 0;
  currentFileUploaded = 0;

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
    // super(router, location);
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
        this.apiService.stateData ? this.getQuestions(this.apiService.stateData) : this.fetchDetails();
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
    console.log("ngOnChange", this.stateData)

  }

  async ngOnInit() {
    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
    if (typeof this.apiConfig === 'string') {
      try {
        this.apiConfig = JSON.parse(this.apiConfig);

        if (!isDataInlocalSotrage) {
          this.setApiService();
          this.apiService.stateData ? this.getQuestions(this.apiService.stateData) : this.fetchDetails();
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
    console.log("ngOninit", this.stateData)

  }

  async getQueryParms() {
    this.queryParamsService.parseQueryParams();
    this.submissionId = this.queryParamsService?.submissionId || this.submissionId || "";
    this.evidenceCode = this.queryParamsService?.evidenceCode || this.evidenceCode;
    // if (!submissionId || !evidenceCode) {
    //   return null;
    // }
  
    return {
      indexDbKey: `${this.submissionId}`,
      evidenceCode: `${this.evidenceCode}`
    };
  }
  
  async setDataInIndexDb(submissionId:any) {
    const queryParamsData = await this.getQueryParms(); 
    const indexDbKey = queryParamsData?.indexDbKey;

    const data = {
      key: submissionId ? submissionId : indexDbKey,
      data: this.assessment
    }
    try {
      await this.db.addData(data);
    } catch (error) {
      console.error("Failed to store data in IndexedDB", error);
    }
  }

  getProgressStatus(submission: any): number {
    if (!submission || !submission.answers) return 0;
  
    const answersObj = submission.answers;
    
    let totalQuestions = 0;
    let answeredCount = 0;
  
    for (const qid of Object.keys(answersObj)) {
      const answer = answersObj[qid];
      const visibleIf = answer.visibleIf;
     
      if (Array.isArray(visibleIf) && visibleIf.length > 0) {
        let isVisible = false;
  
        for (const condition of visibleIf) {
          const targetQid = condition._id;
          const targetValue = condition.value?.[0];
          const operator = condition.operator;
  
          const targetAnswer = answersObj[targetQid];
  
          if (!targetAnswer || targetAnswer.value === undefined || targetAnswer.value === null) {
            isVisible = false;
            break; 
          }
  
          const actualValue = targetAnswer.value;

          if (operator === '===' && actualValue === targetValue) {
            isVisible = true;
          } else {
            isVisible = false;
          }
        }
  
        if (!isVisible) continue; 
      }
  
      totalQuestions++;
  
      const value = answer.value;
  
      const isAnswered =
        value !== undefined &&
        value !== null &&
        (
          Array.isArray(value)
            ? value.some((v: any) =>
                typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined
              )
            : value.toString().trim() !== ''
        );
  
      if (isAnswered) {
        answeredCount++;
      }
    }
  
    if (totalQuestions === 0) return 0;
  
    return Math.round((answeredCount / totalQuestions) * 100);
  }
  
async updateDataInIndexDb(updatedAnswers) {
  const queryParamsData = await this.getQueryParms(); 
  const indexDbKey = queryParamsData?.indexDbKey;
  const evidenceCode = queryParamsData?.evidenceCode;
  if (!indexDbKey || indexDbKey === 'undefined') {
    return false;
  }

  const assessmentClone = JSON.parse(JSON.stringify(this.assessment)); 
  const submissions = assessmentClone.assessment.submissions;
  const evidences = assessmentClone.assessment.evidences;
  const evidenceIndex = +this.apiConfig.index;


  if (!submissions[evidenceCode]) {
    submissions[evidenceCode] = {
      externalId: evidenceCode,
      answers: {},
      startTime: Date.now(),
      endTime: this.endDate,
      gpsLocation: null,
      submittedBy: '',
      submittedByName: '',
      submissionDate: new Date().toISOString(),
      isValid: true,
      status: 'draft',
      progressStatus: 'notStarted',
      completePercentage: 0
    };
  }


  submissions[evidenceCode].answers = { ...updatedAnswers?.answers }; // ensure fresh reference
  submissions[evidenceCode].status = updatedAnswers?.status === 'save'
    ? 'save'
    : updatedAnswers?.status === 'draft'
      ? 'draft'
      : 'submit';


  const progress = this.getProgressStatus(submissions[evidenceCode]);
  let progressStatus = 'notStarted';
  if (progress === 100) progressStatus = 'completed';
  else if (progress > 0) progressStatus = 'inProgress';


  evidences[evidenceIndex].completePercentage = progress;
  evidences[evidenceIndex].progressStatus = progressStatus;
  evidences[evidenceIndex].isSubmitted = ['save', 'submit'].includes(submissions[evidenceCode].status);

  
  const data = {
    key: indexDbKey,
    data: assessmentClone
  };

  try {
    await this.db.updateData(data);
    this.assessment = assessmentClone;

    return true;
  } catch (error) {
    console.error("❌ Failed to store data in IndexedDB", error);
    return false;
  }
}


  


  async deleteFromIndexDb() {
    const queryParamsData = await this.getQueryParms(); 
    const indexDbKey = queryParamsData?.indexDbKey;
    this.db.deleteData(indexDbKey);
  }


  async checkAndMapIndexDbDataToVariables() {
    const queryParamsData = await this.getQueryParms(); 
    const indexDbKey = queryParamsData?.indexDbKey;
    let indexdbData = await this.db.getData(indexDbKey);
    let currentObservation = indexdbData?.data;
    if (this.solutionType === "survey") {
      const submissions = currentObservation?.assessment?.submissions;
      if (submissions && typeof submissions === 'object') {
        this.evidenceCode = Object.keys(submissions)[0];
      }
    }
    if (currentObservation) {
      this.assessment = this.questionnaireService.mapSubmissionToAssessment(
        currentObservation
      );
      this.evidence = this.solutionType == 'observation' ? currentObservation?.assessment?.evidences[+[this.apiConfig.index]] : currentObservation?.assessment?.evidences[0];
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
    this.apiService.solutionType = this.apiConfig.solutionType || 'observation';
    this.apiService.observationId = this.apiConfig.observationId;
    this.apiService.entityId = this.apiConfig.entityId;
    this.apiService.submissionNumber = this.apiConfig.submissionNumber;
    this.apiService.evidenceCode = this.apiConfig.evidenceCode;
    this.apiService.index = this.apiConfig.index;

    this.apiService.profileData = this.apiConfig.profileData;
    this.apiService.stateData = this.apiConfig.stateData;

    this.stateData = this.apiConfig.stateData;
    this.solutionType = this.apiConfig.solutionType || 'observation';
    console.log("setApiService()", this.stateData)

  }

  async fetchDetails() {
    const path = this.solutionType == 'observation' ? this.apiConfig.observationId + `?entityId=${this.apiConfig.entityId}&submissionNumber=${this.apiConfig.submissionNumber}&evidenceCode=${this.apiConfig.evidenceCode}` : this.apiConfig.solutionId
    // this.subscription = this.apiService.post(`${urlConfig[this.solutionType].details}` + path, this.apiConfig.profileData)
    //   .pipe(
    //     catchError((err) => {
    //       throw new Error('Could not fetch the details');
    //     })
    //   )
    //   .subscribe(async (res: any) => {
    //     if(!res.result){
    //       this.surveyExpired(res)
    //       return ;
    //     }

    let res:any = {
      "message": "Assessment fetched successfully",
      "status": 200,
      "result": {
          "entityProfile": {
              "_id": "e5ece2ac-6116-4ea1-b489-dadbdf159e37",
              "entityType": "school"
          },
          "solution": {
              "_id": "68414dfba74def00083d4a5d",
              "externalId": "be0ca79a-41e2-11f0-b407-f44637644dcf-OBSERVATION-TEMPLATE_CHILD",
              "name": "Test 1st Observation led imp 04-06",
              "description": "This is a school assessment to improve the process of raising budget requirements for secondary schools in Punjab",
              "registry": [],
              "captureGpsLocationAtQuestionLevel": false,
              "enableQuestionReadOut": false,
              "scoringSystem": "pointsBasedScoring",
              "isRubricDriven": true,
              "pageHeading": "Domains",
              "criteriaLevelReport": true
          },
          "program": {
              "_id": "6841466f3d8d030008f82e61",
              "isAPrivateProgram": false,
              "externalId": "Test_Observation_WR_and_WOR_along_with_Led_IMP_on_Prod_05_06",
              "name": "Test Observation WR and WOR along with Led IMP on Prod 02-06",
              "description": "This atest implementation to test the slowness of the app",
              "imageCompression": {
                  "quality": 10
              }
          },
          "assessment": {
              "name": "Test 1st Observation led imp 04-06",
              "description": "This is a school assessment to improve the process of raising budget requirements for secondary schools in Punjab",
              "externalId": "be0ca79a-41e2-11f0-b407-f44637644dcf-OBSERVATION-TEMPLATE_CHILD",
              "pageHeading": "Domains",
              "submissionId": "685bb8f9e8708500083b58a8",
              "evidences": [
                  {
                      "code": "I0_1749110251838",
                      "sections": [
                          {
                              "code": "SI1",
                              "questions": [
                                  {
                                      "_id": "",
                                      "question": "",
                                      "isCompleted": "",
                                      "showRemarks": "",
                                      "options": "",
                                      "sliderOptions": "",
                                      "children": "",
                                      "questionGroup": "",
                                      "fileName": "",
                                      "instanceQuestions": "",
                                      "isAGeneralQuestion": "",
                                      "autoCapture": "",
                                      "allowAudioRecording": "",
                                      "prefillFromEntityProfile": "",
                                      "entityFieldName": "",
                                      "isEditable": "",
                                      "showQuestionInPreview": "",
                                      "deleted": "",
                                      "remarks": "",
                                      "value": "",
                                      "usedForScoring": "",
                                      "questionType": "",
                                      "canBeNotApplicable": "",
                                      "visibleIf": "",
                                      "validation": "",
                                      "externalId": "",
                                      "tip": "",
                                      "hint": "",
                                      "responseType": "pageQuestions",
                                      "modeOfCollection": "",
                                      "accessibility": "",
                                      "rubricLevel": "",
                                      "sectionHeader": "",
                                      "page": "p1",
                                      "questionNumber": "",
                                      "updatedAt": "",
                                      "createdAt": "",
                                      "__v": "",
                                      "createdFromQuestionId": "",
                                      "evidenceMethod": "",
                                      "payload": "",
                                      "startTime": "",
                                      "endTime": "",
                                      "gpsLocation": "",
                                      "file": "",
                                      "pageQuestions": [
                                          {
                                              "_id": "68414dfba74def00083d4a15",
                                              "question": [
                                                  "School Location",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Rural"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "Urban"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "I1Q1.1_1749110251838-1749110267911",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "I1. School Identification",
                                              "page": "p1",
                                              "questionNumber": "I1.1",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.541Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d497c",
                                              "evidenceMethod": "I0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a3f",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "I0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          }
                                      ]
                                  }
                              ],
                              "name": "School Identification"
                          },
                          {
                              "code": "SI2",
                              "questions": [
                                  {
                                      "_id": "",
                                      "question": "",
                                      "isCompleted": "",
                                      "showRemarks": "",
                                      "options": "",
                                      "sliderOptions": "",
                                      "children": "",
                                      "questionGroup": "",
                                      "fileName": "",
                                      "instanceQuestions": "",
                                      "isAGeneralQuestion": "",
                                      "autoCapture": "",
                                      "allowAudioRecording": "",
                                      "prefillFromEntityProfile": "",
                                      "entityFieldName": "",
                                      "isEditable": "",
                                      "showQuestionInPreview": "",
                                      "deleted": "",
                                      "remarks": "",
                                      "value": "",
                                      "usedForScoring": "",
                                      "questionType": "",
                                      "canBeNotApplicable": "",
                                      "visibleIf": "",
                                      "validation": "",
                                      "externalId": "",
                                      "tip": "",
                                      "hint": "",
                                      "responseType": "pageQuestions",
                                      "modeOfCollection": "",
                                      "accessibility": "",
                                      "rubricLevel": "",
                                      "sectionHeader": "",
                                      "page": "p1",
                                      "questionNumber": "",
                                      "updatedAt": "",
                                      "createdAt": "",
                                      "__v": "",
                                      "createdFromQuestionId": "",
                                      "evidenceMethod": "",
                                      "payload": "",
                                      "startTime": "",
                                      "endTime": "",
                                      "gpsLocation": "",
                                      "file": "",
                                      "pageQuestions": [
                                          {
                                              "_id": "68414dfba74def00083d4a16",
                                              "question": [
                                                  "Teacher Sex",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Female"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "Male",
                                                      "score": 0
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "I2Q2.1_1749110251838-1749110267911",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "I2. Teacher Identification",
                                              "page": "p1",
                                              "questionNumber": "I2.1",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.548Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d4982",
                                              "evidenceMethod": "I0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a40",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "I0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          }
                                      ]
                                  }
                              ],
                              "name": "Teacher Identification"
                          },
                          {
                              "code": "SI3",
                              "questions": [
                                  {
                                      "_id": "",
                                      "question": "",
                                      "isCompleted": "",
                                      "showRemarks": "",
                                      "options": "",
                                      "sliderOptions": "",
                                      "children": "",
                                      "questionGroup": "",
                                      "fileName": "",
                                      "instanceQuestions": "",
                                      "isAGeneralQuestion": "",
                                      "autoCapture": "",
                                      "allowAudioRecording": "",
                                      "prefillFromEntityProfile": "",
                                      "entityFieldName": "",
                                      "isEditable": "",
                                      "showQuestionInPreview": "",
                                      "deleted": "",
                                      "remarks": "",
                                      "value": "",
                                      "usedForScoring": "",
                                      "questionType": "",
                                      "canBeNotApplicable": "",
                                      "visibleIf": "",
                                      "validation": "",
                                      "externalId": "",
                                      "tip": "",
                                      "hint": "",
                                      "responseType": "pageQuestions",
                                      "modeOfCollection": "",
                                      "accessibility": "",
                                      "rubricLevel": "",
                                      "sectionHeader": "",
                                      "page": "p1",
                                      "questionNumber": "",
                                      "updatedAt": "",
                                      "createdAt": "",
                                      "__v": "",
                                      "createdFromQuestionId": "",
                                      "evidenceMethod": "",
                                      "payload": "",
                                      "startTime": "",
                                      "endTime": "",
                                      "gpsLocation": "",
                                      "file": "",
                                      "pageQuestions": [
                                          {
                                              "_id": "68414dfba74def00083d4a17",
                                              "question": [
                                                  "Grade",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Grade 1"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "Grade 2"
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "Grade 3"
                                                  },
                                                  {
                                                      "value": "R4",
                                                      "label": "Grade 4"
                                                  },
                                                  {
                                                      "value": "R5",
                                                      "label": "Grade 5"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [
                                                  "68414dfba74def00083d4a18"
                                              ],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "I3Q3.1_1749110251838-1749110267912",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "I3. Classroom Identification",
                                              "page": "p1",
                                              "questionNumber": "I3.1",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.555Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d4988",
                                              "evidenceMethod": "I0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a41",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "I0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a18",
                                              "question": [
                                                  "Subject",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Mathematics"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "English"
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "Telugu"
                                                  },
                                                  {
                                                      "value": "R4",
                                                      "label": "EVS/Science"
                                                  },
                                                  {
                                                      "value": "R5",
                                                      "label": "Others"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": [
                                                  {
                                                      "operator": "===",
                                                      "value": [
                                                          "R5"
                                                      ],
                                                      "_id": "68414dfba74def00083d4a17"
                                                  }
                                              ],
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "I3Q3.2_1749110251838-1749110267912",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "I3. Classroom Identification",
                                              "page": "p1",
                                              "questionNumber": "I3.2",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.563Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d498e",
                                              "evidenceMethod": "I0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a41",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "I0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a19",
                                              "question": [
                                                  "Other subject - specify",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "I3Q3.3_1749110251838-1749110267913",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "text",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "I3. Classroom Identification",
                                              "page": "p1",
                                              "questionNumber": "I3.3",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.572Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d4995",
                                              "evidenceMethod": "I0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a41",
                                                  "responseType": "text",
                                                  "evidenceMethod": "I0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          }
                                      ]
                                  }
                              ],
                              "name": "Classroom Identification"
                          }
                      ],
                      "externalId": "I0_1749110251838",
                      "tip": null,
                      "name": "IDENTIFICATION DETAILS",
                      "description": null,
                      "modeOfCollection": "onfield",
                      "canBeNotApplicable": false,
                      "notApplicable": false,
                      "canBeNotAllowed": false,
                      "remarks": null,
                      "sequenceNo": 3,
                      "startTime": "",
                      "endTime": "",
                      "isSubmitted": false,
                      "submissions": []
                  },
                  {
                      "code": "T0_1749110251838",
                      "sections": [
                          {
                              "code": "ST0",
                              "questions": [
                                  {
                                      "_id": "",
                                      "question": "",
                                      "isCompleted": "",
                                      "showRemarks": "",
                                      "options": "",
                                      "sliderOptions": "",
                                      "children": "",
                                      "questionGroup": "",
                                      "fileName": "",
                                      "instanceQuestions": "",
                                      "isAGeneralQuestion": "",
                                      "autoCapture": "",
                                      "allowAudioRecording": "",
                                      "prefillFromEntityProfile": "",
                                      "entityFieldName": "",
                                      "isEditable": "",
                                      "showQuestionInPreview": "",
                                      "deleted": "",
                                      "remarks": "",
                                      "value": "",
                                      "usedForScoring": "",
                                      "questionType": "",
                                      "canBeNotApplicable": "",
                                      "visibleIf": "",
                                      "validation": "",
                                      "externalId": "",
                                      "tip": "",
                                      "hint": "",
                                      "responseType": "pageQuestions",
                                      "modeOfCollection": "",
                                      "accessibility": "",
                                      "rubricLevel": "",
                                      "sectionHeader": "",
                                      "page": "p2",
                                      "questionNumber": "",
                                      "updatedAt": "",
                                      "createdAt": "",
                                      "__v": "",
                                      "createdFromQuestionId": "",
                                      "evidenceMethod": "",
                                      "payload": "",
                                      "startTime": "",
                                      "endTime": "",
                                      "gpsLocation": "",
                                      "file": "",
                                      "pageQuestions": [
                                          {
                                              "_id": "68414dfba74def00083d4a1a",
                                              "question": [
                                                  "Is the teacher teaching or providing a learning activity for most students? (1st snapshot: 4 - 5 min)",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "YES (This includes any activity that is related to class content, independent of its quality)",
                                                      "hint": "Learning activities can include a teacher lecturing, small group/team work, or students working on a worksheet or reading independently. Note that if the teacher leaves the classroom, but has provided students with a learning activity, this would still count as a learning activity."
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "NO (This includes any activity that is not related to class content, including those related to classroom management, disciplining, taking attendance, etc.)",
                                                      "hint": "When the teacher is silently writing on the board without asking students to copy. Other examples of nonlearning activities include: when a teacher takes attendance, s/he may read the children’s names individually; when there are misbehaviors, s/he may stop the lesson to redirect student misbehavior; when there are outside disruptions, s/he may stop teaching to see what is going on; when checking homework, s/he may check each student’s homework individually, while the other students wait with nothing to do. In addition, basic classroom processes may be prolonged, such as transitioning to a new activity, getting materials ready for a lesson, or completing administrative tasks.",
                                                      "score": 0
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "T1Q0.11_1749110251838-1749110267913",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "T1. Time on Learning",
                                              "page": "p2",
                                              "questionNumber": "0.11",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.578Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d499b",
                                              "evidenceMethod": "T0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a42",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "T0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a1b",
                                              "question": [
                                                  "Are students on task? (1st snapshot: 4-5 min)",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Not Applicable",
                                                      "hint": "This behavior is scored as N/A if the teacher is not teaching or providing a learning activity (i.e., if the above question - 0.11 is scored N/A).",
                                                      "score": 0
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "L: 6 or more students are off task"
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "M: 2 - 5 students are off task"
                                                  },
                                                  {
                                                      "value": "R4",
                                                      "label": "H: All students are on task (one student may be off task)"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "T1Q0.21_1749110251838-1749110267913",
                                              "tip": "Please refer to the bulb",
                                              "hint": "Students off task: This includes students who are not participating in the learning activity provided by the teacher either because they are quiet but distracted, or because they are disrupting the class. For example, in the first category, students may be staring out the window, resting their head on the desk, looking down to the floor or at the observer, or sleeping. In the second category, they may be passing notes, whispering, talking to another student during an activity that does not require talking, moving around the class, shouting, or in any other way disrupting the class.",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "T1. Time on Learning",
                                              "page": "p2",
                                              "questionNumber": "0.21",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.584Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49a1",
                                              "evidenceMethod": "T0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a42",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "T0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a1c",
                                              "question": [
                                                  "Is the teacher teaching or providing a learning activity for most students? (1st snapshot: 9 - 10 min)",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "YES (This includes any activity that is related to class content, independent of its quality)"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "NO (This includes any activity that is not related to class content, including those related to classroom management, disciplining, taking attendance, etc.)",
                                                      "score": 0
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "T1Q0.12_1749110251838-1749110267914",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "T1. Time on Learning",
                                              "page": "p2",
                                              "questionNumber": "0.12",
                                              "updatedAt": "2025-06-05T07:57:47.922Z",
                                              "createdAt": "2025-06-05T07:57:46.591Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49a7",
                                              "evidenceMethod": "T0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a42",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "T0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a1d",
                                              "question": [
                                                  "Are students on task? (1st snapshot: 9-10 min)",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Not Applicable",
                                                      "hint": "This behavior is scored as N/A if the teacher is not teaching or providing a learning activity (i.e., if the above question - 0.12 is scored N/A).",
                                                      "score": 0
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "L: 6 or more students are off task"
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "M: 2 - 5 students are off task"
                                                  },
                                                  {
                                                      "value": "R4",
                                                      "label": "H: All students are on task (one student may be off task)"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "T1Q0.22_1749110251838-1749110267914",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "T1. Time on Learning",
                                              "page": "p2",
                                              "questionNumber": "0.22",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.598Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49ad",
                                              "evidenceMethod": "T0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a42",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "T0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a1e",
                                              "question": [
                                                  "Is the teacher teaching or providing a learning activity for most students? (1st snapshot: 14 - 15 min)",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "YES (This includes any activity that is related to class content, independent of its quality)"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "NO (This includes any activity that is not related to class content, including those related to classroom management, disciplining, taking attendance, etc.)",
                                                      "score": 0
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "T1.Q013_1749110251838-1749110267914",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "T1. Time on Learning",
                                              "page": "p2",
                                              "questionNumber": "0.13",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.605Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49b3",
                                              "evidenceMethod": "T0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a42",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "T0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a1f",
                                              "question": [
                                                  "Are students on task? (1st snapshot: 14-15 min)",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Not Applicable",
                                                      "hint": "This behavior is scored as N/A if the teacher is not teaching or providing a learning activity (i.e., if the above question - 0.13 is scored N/A).",
                                                      "score": 0
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "L: 6 or more students are off task"
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "M: 2 - 5 students are off task"
                                                  },
                                                  {
                                                      "value": "R4",
                                                      "label": "H: All students are on task (one student may be off task)"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "T1.Q023_1749110251838-1749110267915",
                                              "tip": "",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "T1. Time on Learning",
                                              "page": "p2",
                                              "questionNumber": "0.23",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.612Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49b9",
                                              "evidenceMethod": "T0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a42",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "T0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          }
                                      ]
                                  }
                              ],
                              "name": "Time on Learning"
                          }
                      ],
                      "externalId": "T0_1749110251838",
                      "tip": null,
                      "name": "TIME ON TASK",
                      "description": null,
                      "modeOfCollection": "onfield",
                      "canBeNotApplicable": false,
                      "notApplicable": false,
                      "canBeNotAllowed": false,
                      "remarks": null,
                      "sequenceNo": 4,
                      "startTime": "",
                      "endTime": "",
                      "isSubmitted": false,
                      "submissions": []
                  },
                  {
                      "code": "A0_1749110251838",
                      "sections": [
                          {
                              "code": "SA1",
                              "questions": [
                                  {
                                      "_id": "",
                                      "question": "",
                                      "isCompleted": "",
                                      "showRemarks": "",
                                      "options": "",
                                      "sliderOptions": "",
                                      "children": "",
                                      "questionGroup": "",
                                      "fileName": "",
                                      "instanceQuestions": "",
                                      "isAGeneralQuestion": "",
                                      "autoCapture": "",
                                      "allowAudioRecording": "",
                                      "prefillFromEntityProfile": "",
                                      "entityFieldName": "",
                                      "isEditable": "",
                                      "showQuestionInPreview": "",
                                      "deleted": "",
                                      "remarks": "",
                                      "value": "",
                                      "usedForScoring": "",
                                      "questionType": "",
                                      "canBeNotApplicable": "",
                                      "visibleIf": "",
                                      "validation": "",
                                      "externalId": "",
                                      "tip": "",
                                      "hint": "",
                                      "responseType": "pageQuestions",
                                      "modeOfCollection": "",
                                      "accessibility": "",
                                      "rubricLevel": "",
                                      "sectionHeader": "",
                                      "page": "p3",
                                      "questionNumber": "",
                                      "updatedAt": "",
                                      "createdAt": "",
                                      "__v": "",
                                      "createdFromQuestionId": "",
                                      "evidenceMethod": "",
                                      "payload": "",
                                      "startTime": "",
                                      "endTime": "",
                                      "gpsLocation": "",
                                      "file": "",
                                      "pageQuestions": [
                                          {
                                              "_id": "68414dfba74def00083d4a20",
                                              "question": [
                                                  "Does the teacher treat all students respectfully?",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "L: Does not treat all respectfully",
                                                      "hint": "L: The teacher may yell at some students, scold them, shame/ridicule them, or use physical punishment to discipline them."
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "M: Treats all somewhat respectfully",
                                                      "hint": "M: The teacher does not treat students disrespectfully (e.g., s/he does not yell at or ridicule students), but the teacher does not show outward signs of respect toward students either (e.g., call students by their names, say “please” or “thank you,” or other culturally relevant signs of respect)."
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "H: Treats all respectfully",
                                                      "hint": "H: The teacher uses students’ names, says “please” and “thank you,” or shows some other culturally relevant sign of respect."
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "A1Q1.1_1749110251838-1749110267915",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A1. Supportive Learning Environment",
                                              "page": "p3",
                                              "questionNumber": "1.1",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.620Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49bf",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a43",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a21",
                                              "question": [
                                                  "Does the teacher use positive labguage with the students?",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "L: Does not use positive language"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "M: Uses some positive language",
                                                      "hint": "M: The teacher may say “well done” or“good”, although this happens infrequently."
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "H: Consistently uses positive language",
                                                      "hint": "H: The teacher consistently uses encouraging phrases such as “Great job!” when students show their work to him/her, or “You can do this!”, or “You are such a talented group of children.”"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "A1Q1.2_1749110251838-1749110267915",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A1. Supportive Learning Environment",
                                              "page": "p3",
                                              "questionNumber": "1.2",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.630Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49c5",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a43",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a22",
                                              "question": [
                                                  "Does the teacher respond to students' needs?",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Not Applicable",
                                                      "hint": "Mark this option (N/A) if there are no observable emotional, material or physical needs"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "L:Is not aware of students' needs or does not address the problem at hand",
                                                      "hint": "L: A student may not have the required supplies for the lesson, and the teacher does not notice or sees it and ignores it. Alternatively, a student may be upset because of a bad grade or a personal problem, and the teacher ignores the student or is dismissive of the issue (e.g., the teacher tells the student to “get over it” or “pull yourself together”)."
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "M: Responds to students' needs but may not address the problem at hand",
                                                      "hint": "M: A student may be upset because s/he does not have a pencil, and the teacher asks another child to share his/her pencil, but s/he refuses. The teacher carries on with the lesson without solving the problem."
                                                  },
                                                  {
                                                      "value": "R4",
                                                      "label": "H: Promptly responds to students' needs in a way that addresses the problem at hand.",
                                                      "hint": "H: If a student does not have a pencil, the teacher allows the child to borrow one from his/her spare pencil box."
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "A1Q1.3_1749110251838-1749110267916",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A1. Supportive Learning Environment",
                                              "page": "p3",
                                              "questionNumber": "1.3",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.641Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49cb",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a43",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a23",
                                              "question": [
                                                  "Does the teacher exhibit any gender bias? Does s/he challenge gender stereotypes?",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "Not Applicable",
                                                      "hint": "Mark this option (N/A) if the observation is in a uni-gender classroom"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "L: Exhibits gender bias or reinforces gender stereotypes in the classroom",
                                                      "hint": "L: A teacher seats girls exclusively at the back of the classroom or only calls on boys to answer difficult questions. Alternatively, the teacher calls equally on students of all genders to answer difficult questions, but only assigns girls to classroom cleaning tasks."
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "M: Does not exhibit gender bias, but does not challenge gender stereotypes either",
                                                      "hint": "M: The teacher assigns cleaning tasks to children of all genders, and calls equally on all genders to answer difficult questions."
                                                  },
                                                  {
                                                      "value": "R4",
                                                      "label": "H: Does not exhibit gender bias AND challenges gender stereotypes in the classroom",
                                                      "hint": "H: The teacher assigns cleaning tasks to children of all genders, and calls equally on all genders to answer difficult questions. In addition, the teacher uses examples and explanations that portray female rather than male scientists, doctors, and astronauts."
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "A1Q1.4_1749110251838-1749110267916",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A1. Supportive Learning Environment",
                                              "page": "p3",
                                              "questionNumber": "1.4",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.648Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49d1",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a43",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a24",
                                              "question": [
                                                  "From the above observations, how effective is the teacher in creating supporting learning environment in this classroom? (1 - completely ineffective, 5 - most effective)",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [],
                                              "sliderOptions": [
                                                  {
                                                      "value": 1,
                                                      "score": 1
                                                  },
                                                  {
                                                      "value": 2,
                                                      "score": 2
                                                  },
                                                  {
                                                      "value": 3,
                                                      "score": 3
                                                  },
                                                  {
                                                      "value": 4,
                                                      "score": 4
                                                  },
                                                  {
                                                      "value": 5,
                                                      "score": 5
                                                  }
                                              ],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true,
                                                  "max": "5",
                                                  "min": "1"
                                              },
                                              "externalId": "A1Q1.S_1749110251838-1749110267916",
                                              "tip": "Please refer to the bulb",
                                              "hint": "You may want to refer to the observations made on the above four behaviours while arriving at a score here. 1- completely ineffective; 5- most effective",
                                              "responseType": "slider",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A1. Supportive Learning Environment",
                                              "page": "p3",
                                              "questionNumber": "1.S",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.655Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49d7",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a43",
                                                  "responseType": "slider",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          }
                                      ]
                                  }
                              ],
                              "name": "Supportive Learning Environment"
                          },
                          {
                              "code": "SA2",
                              "questions": [
                                  {
                                      "_id": "",
                                      "question": "",
                                      "isCompleted": "",
                                      "showRemarks": "",
                                      "options": "",
                                      "sliderOptions": "",
                                      "children": "",
                                      "questionGroup": "",
                                      "fileName": "",
                                      "instanceQuestions": "",
                                      "isAGeneralQuestion": "",
                                      "autoCapture": "",
                                      "allowAudioRecording": "",
                                      "prefillFromEntityProfile": "",
                                      "entityFieldName": "",
                                      "isEditable": "",
                                      "showQuestionInPreview": "",
                                      "deleted": "",
                                      "remarks": "",
                                      "value": "",
                                      "usedForScoring": "",
                                      "questionType": "",
                                      "canBeNotApplicable": "",
                                      "visibleIf": "",
                                      "validation": "",
                                      "externalId": "",
                                      "tip": "",
                                      "hint": "",
                                      "responseType": "pageQuestions",
                                      "modeOfCollection": "",
                                      "accessibility": "",
                                      "rubricLevel": "",
                                      "sectionHeader": "",
                                      "page": "p4",
                                      "questionNumber": "",
                                      "updatedAt": "",
                                      "createdAt": "",
                                      "__v": "",
                                      "createdFromQuestionId": "",
                                      "evidenceMethod": "",
                                      "payload": "",
                                      "startTime": "",
                                      "endTime": "",
                                      "gpsLocation": "",
                                      "file": "",
                                      "pageQuestions": [
                                          {
                                              "_id": "68414dfba74def00083d4a25",
                                              "question": [
                                                  "Does the teacher set clear behavioural expectations for classroom activities",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "L: Does not set behavioral expectations for classroom",
                                                      "hint": "L: The teacher says, “Work on your reading comprehension skills,” without providing instruction on what the expected behavior is for the activity."
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "M: Sets unclear or superficial behavioral expectations",
                                                      "hint": "M: When introducing a group activity, the teacher says, “Please sit in your preassigned groups and behave,” without clarifying what such behavior would entail."
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "H: Sets clear behavioral expectations OR students are well-behaved throughout the lesson.",
                                                      "hint": "H: Upon introducing a group activity to the class, the teacher explicitly states the expected behavior for students in the group. This may include, “Use a quiet indoor voice” or “Take turns speaking.” If students are working independently, the teacher gives directions on what to do when they complete the activity. The teacher says, “Please quietly get up, bring your worksheet to me, and read while you wait for your classmates to finish.”"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "A2Q2.1_1749110251838-1749110267917",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A2. Positive Behavioural Expectations",
                                              "page": "p4",
                                              "questionNumber": "2.1",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.662Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49dd",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a44",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a26",
                                              "question": [
                                                  "Does the teacher acknowledge positive student behaviour?",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "L: Does not acknowledge student behaviour"
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "M: Acknowledges some students’ behavior, but is not specific about their expected behavior",
                                                      "hint": "M: If a group is following behavioral expectations, the teacher says, “This group is working well together” or “This group is doing a good job,” without clarifying why or how."
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "H: Acknowledges students’ positive behavior that meets or exceeds expectations",
                                                      "hint": "H: A teacher says to the class, “I just noticed that members of Group A are taking turns to speak and are proactively working on the next assignment.”"
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "A2Q2.2_1749110251838-1749110267917",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A2. Positive Behavioural Expectations",
                                              "page": "p4",
                                              "questionNumber": "2.2",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.669Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49e3",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a44",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a27",
                                              "question": [
                                                  "Does the teacher redirect misbehaviour and focus on the expected behaviour, rather than the undesired behaviour?",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [
                                                  {
                                                      "value": "R1",
                                                      "label": "L: Redirection of misbehavior is ineffective and focuses on misbehaviors, rather than the expected behavior.",
                                                      "hint": "L: If s/he notices a distracted student, the teacher stops lecturing and calls out the name of the student, asking her, “Why are you not paying attention in class?” Alternatively, the teacher continues to ignore the student who is distracted, but the distracted student begins to tease and argue with the peer sitting next to her. This shifts the focus of the entire class away from the lesson and onto those 2 students."
                                                  },
                                                  {
                                                      "value": "R2",
                                                      "label": "M: Redirection of misbehavior is effective but focuses on misbehaviors rather than the expected behavior. Alternatively, redirection of misbehavior is somewhat effective and focuses on the expected behavior.",
                                                      "hint": "M: Upon noticing that 3 students are not working on the assigned problems, the teacher says, “You 3 need to stop talking now, you are making too much noise.” This statement focuses on the disruptive students’ negative behavior, rather than on what is expected of them. Consequently, the disruptive students quiet down. In another scenario, the teacher redirects the students by asking them to “Focus on the task at hand.” Even though the teacher focuses on the positive behavior expected from the students, for the most part, they continue to talk."
                                                  },
                                                  {
                                                      "value": "R3",
                                                      "label": "H: When a problem arises, redirection of misbehavior effectively addresses the problem at hand and focuses on the expected behavior. OR the students are well-behaved throughout the lesson",
                                                      "hint": "H: If students are talking loudly andbeing disruptive during a lesson, the teacher says, “Remember to use quiet voices,” and the students quiet down."
                                                  }
                                              ],
                                              "sliderOptions": [],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true
                                              },
                                              "externalId": "A2Q2.3_1749110251838-1749110267918",
                                              "tip": "Please refer to the response level hints for some observable behaviour examples",
                                              "hint": "",
                                              "responseType": "radio",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A2. Positive Behavioural Expectations",
                                              "page": "p4",
                                              "questionNumber": "2.3",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.676Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49e9",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a44",
                                                  "responseType": "radio",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          },
                                          {
                                              "_id": "68414dfba74def00083d4a28",
                                              "question": [
                                                  "From the above observations, how effective is the teacher at promoting positive behavior in this classroom? (1 - completely ineffective, 5 - most effective)\"",
                                                  ""
                                              ],
                                              "isCompleted": false,
                                              "showRemarks": false,
                                              "options": [],
                                              "sliderOptions": [
                                                  {
                                                      "value": 1,
                                                      "score": 1
                                                  },
                                                  {
                                                      "value": 2,
                                                      "score": 2
                                                  },
                                                  {
                                                      "value": 3,
                                                      "score": 3
                                                  },
                                                  {
                                                      "value": 4,
                                                      "score": 4
                                                  },
                                                  {
                                                      "value": 5,
                                                      "score": 5
                                                  }
                                              ],
                                              "children": [],
                                              "questionGroup": [
                                                  "A1"
                                              ],
                                              "fileName": [],
                                              "instanceQuestions": [],
                                              "isAGeneralQuestion": false,
                                              "autoCapture": false,
                                              "allowAudioRecording": false,
                                              "prefillFromEntityProfile": false,
                                              "entityFieldName": "",
                                              "isEditable": true,
                                              "showQuestionInPreview": false,
                                              "deleted": false,
                                              "remarks": "",
                                              "value": "",
                                              "usedForScoring": "",
                                              "questionType": "auto",
                                              "canBeNotApplicable": "false",
                                              "visibleIf": "",
                                              "validation": {
                                                  "required": true,
                                                  "max": "5",
                                                  "min": "1"
                                              },
                                              "externalId": "A2Q2.S_1749110251838-1749110267918",
                                              "tip": "Please refer to the bulb",
                                              "hint": "You may want to refer to the observations made on the above three behaviours while arriving at a score here. 1- completely ineffective; 5- most effective",
                                              "responseType": "slider",
                                              "modeOfCollection": "onfield",
                                              "accessibility": "No",
                                              "rubricLevel": "",
                                              "sectionHeader": "A2. Positive Behavioural Expectations",
                                              "page": "p4",
                                              "questionNumber": "2.S",
                                              "updatedAt": "2025-06-05T07:57:47.923Z",
                                              "createdAt": "2025-06-05T07:57:46.723Z",
                                              "__v": 0,
                                              "createdFromQuestionId": "68414dfaa74def00083d49ef",
                                              "evidenceMethod": "A0_1749110251838",
                                              "payload": {
                                                  "criteriaId": "68414dfba74def00083d4a44",
                                                  "responseType": "slider",
                                                  "evidenceMethod": "A0_1749110251838",
                                                  "rubricLevel": ""
                                              },
                                              "startTime": "",
                                              "endTime": "",
                                              "gpsLocation": "",
                                              "file": ""
                                          }
                                      ]
                                  }
                              ],
                              "name": "Positive Behavioural Expectations"
                          }
                      ],
                      "externalId": "A0_1749110251838",
                      "tip": null,
                      "name": "CLASSROOM CULTURE",
                      "description": null,
                      "modeOfCollection": "onfield",
                      "canBeNotApplicable": false,
                      "notApplicable": false,
                      "canBeNotAllowed": false,
                      "remarks": null,
                      "sequenceNo": 6,
                      "startTime": "",
                      "endTime": "",
                      "isSubmitted": false,
                      "submissions": []
                  }
              ],
              "submissions": {}
          }
      },
      "responseCode": "OK"
  }
        if (res.result) {
          this.assessment = this.questionnaireService.mapSubmissionToAssessment(
            res.result
          );
          this.submissionId = this.assessment.assessment.submissionId;
            this.evidenceCode = this.assessment.assessment.evidences[0].code;


          let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();

          if(!isDataInlocalSotrage){

          this.setDataInIndexDb(this.submissionId);
              
          this.evidence = this.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];
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

        } else {
          this.toaster.showToast('Something went wrong, Please try again later', 'danger', 5000)
        }

      // });
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

  async submitImageToCloud(payload: any, uploadQueue: any[]): Promise<any[]> {
    try {
      const response: any = await firstValueFrom(
        this.apiService.post(urlConfig.presignedUrl, payload)
      );
      const submissionId = Object.keys(response.result)[0]; // Use single known submissionId
  
      const uploadResults: any[] = [];
  
      for (let file of uploadQueue) {
        const fileList = response.result[submissionId].files;
        const presignedUrlData = fileList.find((f: any) =>
          f.file.endsWith(file.name)
        );
  
        if (!presignedUrlData) {
          console.error(`Presigned URL not found for file: ${file.name}`);
          continue;
        }
  
        const headers = new HttpHeaders({
          'Content-Type': 'multipart/form-data',
          'x-ms-blob-type': 'BlockBlob',
        });

        const storedFile: any = await this.db.getData(file.name);
         if(storedFile.data){
          const convertedFile = this.attachmentService.base64ToFile(storedFile.data);
              file.file = convertedFile;
         }
        await firstValueFrom(
          this.http.put(presignedUrlData.url, file.file, { headers })
        );
  
        file.isUploaded = true;
        file.url = presignedUrlData.url.split('?')[0];
        file.previewUrl = presignedUrlData.url.split('?')[0];
        file.sourcePath = presignedUrlData.payload?.sourcePath || '';
        this.currentFileUploaded++;
        uploadResults.push(file);
      }
  
      return uploadResults;
  
    } catch (err) {
      console.error('Batch upload failed', err);
      throw err;
    }
  }
  
  
  
  async submitSurvey(submissionData) {
    if (submissionData.status !== 'draft') {
      if (!this.saveQuestioner) {
        const confirmationParams = {
          title: 'Confirmation',
          message: `Are you sure you want to submit the ${this.solutionType}?`,
          actionBtns: true,
          cancelLabel: 'Cancel',
          acceptLabel: 'Confirm',
        };
  
        const response = await this.openAlert(confirmationParams);
        if (!response) return;
  
        this.totalFileToUpload = 0;
        this.currentFileUploaded = 0;
  
        const answers = submissionData?.answers;
        const uploadQueue: any[] = [];
  
        // Collect all files that need uploading
        for (let [submissionId, answerObj] of Object.entries(answers)) {
          const files = (answerObj as any).fileName || [];
          for (let file of files) {
            if (!file?.isUploaded) {
              this.totalFileToUpload++;
              const storedFile: any = await this.db.getData(file.name);
              if (!storedFile || !storedFile.data) {
                this.toaster.showToast(`No stored data found for file: ${file.name}`, 'danger', 5000);
                continue;
              }
              // const convertedFile = this.attachmentService.base64ToFile(storedFile.data);
              // file.file = convertedFile;
              file.submissionId = submissionId;
              uploadQueue.push(file);
            }
          }
        }
  
        this.uploading = true;
  
        try {
          if (uploadQueue.length > 0) {
            // Prepare payload for bulk upload
            const payload = {
              ref: 'survey',
              request: {
                [this.submissionId]: {
                  files: uploadQueue.map(file => file.name)
                }
              }
            };
  
            const uploadedFiles = await this.submitImageToCloud(payload, uploadQueue);
  
            for (let i = 0; i < uploadQueue.length; i++) {
              const file = uploadQueue[i];
              const presignedUrlData = uploadedFiles[i];
  
              file.isUploaded = true;
              // file.previewUrl = presignedUrlData.url.split('?')[0];
              file.url = presignedUrlData.url.split('?')[0];
              file.sourcePath = presignedUrlData.sourcePath;
              // file.file = '';
  
              this.currentFileUploaded++;
            }
  
            await this.updateDataInIndexDb(submissionData);
          }
        } catch (uploadErr) {
          console.error('Batch upload failed:', uploadErr);
          this.toaster.showToast(`Failed to upload files`, 'danger', 5000);
          this.uploading = false;
          return;
        } finally {
          this.uploading = false;
        }
      }
  
      const responseFromUpdateDataFunction = await this.updateDataInIndexDb(submissionData);
      if (responseFromUpdateDataFunction) {
        this.apiService
          .post(
            `${urlConfig[this.solutionType].update}${this.assessment.assessment.submissionId}`,
            { evidence: submissionData }
          )
          .pipe(
            catchError((err) => {
              this.toaster.showToast(err?.error?.message, 'danger', 5000);
              throw new Error('Update API has failed');
            })
          )
          .subscribe((res: any) => {
            if (res.status === 200 && !this.saveQuestioner) {
              this.formIsNotDirty();
              const footer = this.el.nativeElement.querySelector('.footer-buttons');
              this.renderer.setStyle(footer, 'display', 'none');
              this.toaster.showToast(
                `Your ${this.solutionType} has been submitted successfully.`,
                'success',
                5000
              );
              this.evidence.isSubmitted = true;
            }
          });
      }
    } else {
      const responseFromUpdateDataFunction = await this.updateDataInIndexDb(submissionData);
      if (responseFromUpdateDataFunction && !this.saveQuestioner) {
        this.formIsNotDirty();
        const confirmationParams = {
          title: 'Success',
          message: `Successfully your ${this.solutionType} has been saved. Do you want to continue?`,
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
    this.toaster.clearToaster()
    if (this.solutionType == 'observation' && this.questionnaireForm.dirty) {
      this.saveQuestioner = true;
      if(!this.assessment.assessment.evidences[0].isSubmitted){
        this.submission('draft');
      }
      this.subscription?.unsubscribe();
      this.sharedService.updateValue(false);
      this.questionnaireForm.reset();
      if (document.getElementById('observation-ion-toolbar')) {
        document.getElementById('observation-ion-toolbar').style.display = 'block';
      }
    }
  }

  async start() {
    const { observationAsTask, isATargetedSolution } = this.stateData || {};

    if (observationAsTask || isATargetedSolution) {
      const message = { type: 'START', data: this.stateData };
      window.postMessage(message, '*');
    } else {
      this.toaster.showToast(
        'Dear User, this Observation is not relevant for your subrole and location',
        'danger',
        5000
      );
    }
  }

  async getQuestions(data) {

    if (data?.isATargetedSolution === false) {

      this.toaster.showToast('Dear User, this Observation is not relevant for your subrole and location', 'danger', 5000)

    }

    this.assessment = this.questionnaireService.mapSubmissionToAssessment(

      data

    );

    this.submissionId = this.assessment.assessment.submissionId;
    this.evidenceCode = this.assessment.assessment.evidences[0].code;
    this.apiConfig.index = 0;

    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();

    if(!isDataInlocalSotrage){

    this.setDataInIndexDb(this.submissionId);
        
    this.evidence = this.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];
    
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

  surveyExpired(data){
    const message = { type: 'EXPIRED', data: data };
    window.postMessage(message, '*');
  }

}
